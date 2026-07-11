/**
 * Super Agent Liquidity & Risk Intelligence Platform
 * Module: agentRiskScorer.js
 * Description: Evaluates transaction velocity, amount uniformity, and account concentration
 *              to calculate an advisory Operational Risk Score. Mutates the agent object inline.
 * 
 * RULE COMPLIANCE: 
 * - Uses careful, advisory language ("Unusual pattern requires review").
 * - An anomaly is NOT proof of fraud; explicitly outputs system uncertainty[cite: 1].
 * - Respects provider boundaries by evaluating risk per provider individually[cite: 1].
 */

/**
 * Calculates a risk score for a specific slice of transactions.
 * @param {Array} transactions - Array of transaction objects.
 * @param {number} baselineVolume - Normal expected transaction volume for the time window.
 * @returns {Object} Detailed risk assessment payload.
 */
function analyzeTransactionSlice(transactions, baselineVolume = 5) {
  if (!transactions || transactions.length === 0) {
    return {
      score: 0,
      tier: "NORMAL",
      advisory_notice: "No recent transactions recorded.",
      evidence: "Activity volume is 0.",
      uncertainty: "None.",
      metrics: { velocity_score: 0, uniformity_score: 0, concentration_score: 0 }
    };
  }

  const txCount = transactions.length;

  // 1. VELOCITY SCORE (0-100): Is transaction frequency unusually high?
  const velocityRatio = txCount / baselineVolume;
  const velocityScore = Math.min(Math.round((velocityRatio / 4) * 100), 100);

  // 2. AMOUNT UNIFORMITY SCORE (0-100): Are amounts suspiciously identical?[cite: 1]
  const amountCounts = {};
  let maxIdenticalCount = 0;
  let mostCommonAmount = 0;

  transactions.forEach(tx => {
    const amt = Number(tx.amount) || 0;
    // Group roughly identical amounts within a ±50 BDT variance window
    const roundedAmt = Math.round(amt / 50) * 50;
    amountCounts[roundedAmt] = (amountCounts[roundedAmt] || 0) + 1;
    if (amountCounts[roundedAmt] > maxIdenticalCount) {
      maxIdenticalCount = amountCounts[roundedAmt];
      mostCommonAmount = roundedAmt;
    }
  });
  const uniformityScore = Math.round((maxIdenticalCount / txCount) * 100);

  // 3. ACCOUNT CONCENTRATION SCORE (0-100): Are requests from a tiny account group?[cite: 1]
  // Fallback to transaction_id if customer/sender IDs are not explicitly provided in mock data
  const uniqueAccounts = new Set(
    transactions.map(tx => tx.customer_id || tx.sender_account || tx.account_id || tx.transaction_id)
  ).size;
  const concentrationScore = Math.round((1 - (uniqueAccounts / txCount)) * 100);

  // 4. COMPOSITE RISK SCORE: Weighted average (30% Velocity, 40% Uniformity, 30% Concentration)
  const rawScore = (velocityScore * 0.3) + (uniformityScore * 0.4) + (concentrationScore * 0.3);
  const finalScore = Math.min(Math.max(Math.round(rawScore), 0), 100);

  // 5. DETERMINE ADVISORY TIER & CAUTIOUS LANGUAGE[cite: 1]
  let tier = "NORMAL";
  let advisoryText = "Transaction patterns are within normal operational thresholds.";
  let uncertaintyText = "Low - Pattern matches standard commercial retail activity.";

  if (finalScore >= 80) {
    tier = "CRITICAL_REVIEW";
    advisoryText = "Unusual pattern requires operational review. Multiple near-identical transactions detected from a concentrated source[cite: 1].";
    uncertaintyText = "Moderate - May represent legitimate wholesale commercial trading or localized holiday demand surges (e.g., pre-Eid rush)[cite: 1]. Do not initiate automated account freezes[cite: 1].";
  } else if (finalScore >= 60) {
    tier = "HIGH_PRIORITY";
    advisoryText = "Elevated transaction velocity and repeated amounts detected. Recommend verification before dispensing large physical cash reserves[cite: 1].";
    uncertaintyText = "Moderate - High probability of normal seasonal demand spike[cite: 1].";
  } else if (finalScore >= 40) {
    tier = "ELEVATED";
    advisoryText = "Activity volume is higher than standard baseline averages.";
    uncertaintyText = "Low to Moderate - Likely standard market traffic fluctuations.";
  }

  // 6. GENERATE UNDERSTANDABLE EVIDENCE[cite: 1]
  const evidenceString = `Analyzed ${txCount} transactions. Flagged because ${maxIdenticalCount} of ${txCount} requests were for roughly ~${mostCommonAmount} BDT, originating from ${uniqueAccounts} distinct account identifier(s)[cite: 1].`;

  return {
    score: finalScore,
    tier: tier,
    advisory_notice: advisoryText,
    evidence: evidenceString,
    uncertainty: uncertaintyText,
    metrics: {
      velocity_score: velocityScore,
      uniformity_score: uniformityScore,
      concentration_score: concentrationScore
    }
  };
}

/**
 * Injects risk scores into the agent object for each provider and overall.
 * @param {Object} agent - The target agent object.
 * @param {number} [defaultBaseline=5] - Default baseline transaction count per provider window.
 * @returns {Object} The mutated agent object with updated operational_metrics.
 */
function injectAgentRiskScore(agent, defaultBaseline = 5) {
  if (!agent) return agent;

  const allTxns = agent.recent_transactions || [];
  
  // 1. Group transactions by provider to maintain strict provider boundaries[cite: 1]
  const providerTxns = {
    bKash: [],
    Nagad: [],
    Rocket: []
  };

  allTxns.forEach(tx => {
    const provider = tx.provider_id;
    if (!providerTxns[provider]) {
      providerTxns[provider] = [];
    }
    providerTxns[provider].push(tx);
  });

  // 2. Analyze each provider independently[cite: 1]
  const providerBreakdown = {};
  let highestProviderScore = 0;
  let highestRiskProviderName = "NONE";
  let primaryAdvisoryNotice = "All provider transaction flows are operating normally.";
  let primaryEvidence = "No anomalies detected across active providers.";
  let primaryUncertainty = "None.";
  let primaryTier = "NORMAL";

  for (const [providerName, txList] of Object.entries(providerTxns)) {
    const analysis = analyzeTransactionSlice(txList, defaultBaseline);
    providerBreakdown[providerName] = analysis;

    // Track the highest risk provider to surface to the central dashboard queue
    if (analysis.score > highestProviderScore) {
      highestProviderScore = analysis.score;
      highestRiskProviderName = providerName;
      primaryAdvisoryNotice = analysis.advisory_notice;
      primaryEvidence = `[${providerName}] ${analysis.evidence}`;
      primaryUncertainty = analysis.uncertainty;
      primaryTier = analysis.tier;
    }
  }

  // 3. Analyze overall aggregate outlet risk
  const aggregateAnalysis = analyzeTransactionSlice(allTxns, defaultBaseline * 3);

  // 4. Ensure operational_metrics exists and inject results
  if (!agent.operational_metrics) {
    agent.operational_metrics = {};
  }

  agent.operational_metrics.risk_analysis = {
    evaluated_at: new Date().toISOString(),
    primary_risk_provider: highestRiskProviderName,
    overall_risk_score: highestProviderScore > aggregateAnalysis.score ? highestProviderScore : aggregateAnalysis.score,
    overall_risk_tier: primaryTier,
    advisory_notice: primaryAdvisoryNotice,
    evidence: primaryEvidence,
    system_uncertainty: primaryUncertainty,
    provider_breakdown: providerBreakdown,
    aggregate_metrics: aggregateAnalysis.metrics
  };

  return agent;
}

// Export module for Node.js backend or frontend frameworks
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { injectAgentRiskScore, analyzeTransactionSlice };
}