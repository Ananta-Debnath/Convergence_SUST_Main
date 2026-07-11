/**
 * Super Agent Liquidity & Risk Intelligence Platform
 * Module: predictor.js
 * Description: Calculates real-time net drain velocities, depletion countdowns,
 *              and shortage ETAs, saving the results directly inside the agent object.
 */

/**
 * Formats a Date object into a readable 12-hour time string (e.g., "05:20 PM").
 * @param {Date} dateObj 
 * @returns {string} Formatted time string
 */
function formatETA(dateObj) {
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/**
 * Calculates liquidity pressure, updates the agent object inline with ETA data,
 * and returns the updated agent object.
 * @param {Object} agent - The agent data object containing balances and recent_transactions.
 * @param {number} [defaultWindowMins=60] - Default evaluation window if timestamps are sparse.
 * @returns {Object} The mutated agent object containing updated operational_metrics.
 */
function injectAgentPredictions(agent, defaultWindowMins = 60) {
  if (!agent || !agent.balances) return agent;

  // 1. Establish reference time "Now" (Use agent's last_updated for reliable demo replay)
  const referenceTime = agent.last_updated ? new Date(agent.last_updated) : new Date();
  
  // 2. Filter valid completed transactions
  const validTxns = (agent.recent_transactions || []).filter(
    tx => tx.status && tx.status.toLowerCase() === 'success'
  );

  // 3. Determine effective time window (Delta T) in minutes
  let effectiveWindowMins = defaultWindowMins;
  if (validTxns.length >= 2) {
    const timestamps = validTxns.map(tx => new Date(tx.time).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeSpanMins = (maxTime - minTime) / (1000 * 60);
    effectiveWindowMins = Math.max(timeSpanMins, 30); // Floor at 30 mins to avoid spike distortion
  }

  // 4. Initialize accounting trackers
  const drainTrackers = {
    shared_physical_cash: { total_drained: 0, total_gained: 0, tx_count: 0 },
    bKash: { total_drained: 0, total_gained: 0, tx_count: 0 },
    Nagad: { total_drained: 0, total_gained: 0, tx_count: 0 },
    Rocket: { total_drained: 0, total_gained: 0, tx_count: 0 }
  };

  // 5. Apply Financial Mechanics to aggregate flows
  validTxns.forEach(tx => {
    const amount = Number(tx.amount) || 0;
    const provider = tx.provider_id;
    const type = tx.transaction_type ? tx.transaction_type.toLowerCase() : '';

    if (!drainTrackers[provider]) {
      drainTrackers[provider] = { total_drained: 0, total_gained: 0, tx_count: 0 };
    }

    if (type === 'cash-out') {
      // Customer Cash-Out: Agent gives physical cash (Drain), Agent receives E-Money (Gain)
      drainTrackers.shared_physical_cash.total_drained += amount;
      drainTrackers.shared_physical_cash.tx_count += 1;
      
      drainTrackers[provider].total_gained += amount;
      drainTrackers[provider].tx_count += 1;
    } 
    else if (type === 'cash-in') {
      // Customer Cash-In: Agent receives physical cash (Gain), Agent sends E-Money (Drain)
      drainTrackers.shared_physical_cash.total_gained += amount;
      drainTrackers.shared_physical_cash.tx_count += 1;
      
      drainTrackers[provider].total_drained += amount;
      drainTrackers[provider].tx_count += 1;
    }
  });

  // 6. Build prediction reports
  const predictions = {};
  const allBalances = {
    shared_physical_cash: agent.balances.shared_physical_cash,
    ...agent.balances.provider_e_money
  };

  let mostCriticalAsset = null;
  let lowestMinutesLeft = Infinity;

  for (const [assetName, currentBalance] of Object.entries(allBalances)) {
    const tracker = drainTrackers[assetName] || { total_drained: 0, total_gained: 0, tx_count: 0 };
    const netDrain = tracker.total_drained - tracker.total_gained;
    const drainRatePerMin = netDrain / effectiveWindowMins;

    let confidence = "LOW (Sparse Data)";
    if (tracker.tx_count >= 5) confidence = "HIGH";
    else if (tracker.tx_count >= 2) confidence = "MODERATE";

    const assetReport = {
      status: "HEALTHY",
      minutes_remaining: null,
      eta: null,
      net_drain_rate_per_min: Number(drainRatePerMin.toFixed(2)),
      confidence: confidence,
      evidence: `Stable or growing (Net flow: +${Math.abs(netDrain)} BDT).`
    };

    if (drainRatePerMin > 0) {
      const minutesLeft = Math.round(currentBalance / drainRatePerMin);
      const etaDate = new Date(referenceTime.getTime() + (minutesLeft * 60 * 1000));
      
      assetReport.minutes_remaining = minutesLeft;
      assetReport.eta = formatETA(etaDate);
      assetReport.evidence = `Draining at ${drainRatePerMin.toFixed(2)} BDT/min across ${tracker.tx_count} transactions.`;

      if (minutesLeft <= 60) {
        assetReport.status = "CRITICAL_SHORTAGE";
      } else if (minutesLeft <= 120) {
        assetReport.status = "WARNING_PRESSURE";
      } else {
        assetReport.status = "MONITORING";
      }

      // Track the absolute lowest window for the primary objective tracker
      if (minutesLeft < lowestMinutesLeft) {
        lowestMinutesLeft = minutesLeft;
        mostCriticalAsset = {
          provider: assetName,
          estimated_window_mins: minutesLeft,
          eta: assetReport.eta,
          status: assetReport.status
        };
      }
    }

    predictions[assetName] = assetReport;
  }

  // 7. Mutate the agent object to include the live calculations
  if (!agent.operational_metrics) {
    agent.operational_metrics = {};
  }

  // Save detailed individual asset breakdowns
  agent.operational_metrics.liquidity_predictions = predictions;
  
  // Update or set the primary project summary keys matching your specification
  agent.operational_metrics.projected_emoney_shortage = mostCriticalAsset ? {
    provider: mostCriticalAsset.provider,
    estimated_window_mins: mostCriticalAsset.estimated_window_mins,
    eta: mostCriticalAsset.eta,
    status: mostCriticalAsset.status
  } : {
    provider: "NONE",
    estimated_window_mins: null,
    eta: null,
    status: "ALL_BALANCES_HEALTHY"
  };

  // Log calculation properties for auditing
  agent.operational_metrics.prediction_metadata = {
    calculated_at: referenceTime.toISOString(),
    window_mins_used: Math.round(effectiveWindowMins)
  };

  return agent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { injectAgentPredictions, formatETA };
}