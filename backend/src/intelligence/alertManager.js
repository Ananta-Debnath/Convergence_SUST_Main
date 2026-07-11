/**
 * Super Agent Liquidity & Risk Intelligence Platform
 * Module: alertManager.js
 * Description: Event-driven alert generator with stateful deduplication, auto-healing
 *              resolution cleanup, absolute UI timestamps, and SSOT agent injection.
 */

// STATEFUL LEDGER: Remembers active alerts in memory to prevent duplicate spam
const activeAlertLedger = new Map();

/**
 * Generates a deterministic unique key for an alert condition.
 * Including severity ensures an upgrade from WARNING to CRITICAL triggers a new alert.
 * @param {string} agentId 
 * @param {string} alertType 
 * @param {string} provider 
 * @param {string} severityOrStatus 
 * @returns {string} Deterministic deduplication key
 */
function createDedupKey(agentId, alertType, provider, severityOrStatus) {
  return `${agentId}:${alertType}:${provider}:${severityOrStatus}`;
}

/**
 * Evaluates agent metrics on a transaction event, updates the deduplication ledger,
 * cleans up resolved issues, and injects active alerts directly into the agent object.
 * 
 * @param {Object} agent - The evaluated agent object containing live predictions & risk scores.
 * @returns {Object} { updated_agent: Object, new_alerts: Array, active_count: number, resolved_keys: Array }
 */
function generateActiveAlerts(agent) {
  if (!agent || !agent.operational_metrics) {
    if (agent) agent.active_alerts = [];
    return { updated_agent: agent, new_alerts: [], active_count: 0, resolved_keys: [] };
  }

  const newAlerts = [];
  const currentCycleKeys = new Set(); // Tracks what is actively failing in this evaluation cycle
  const now = new Date();
  const nowIso = now.toISOString();
  const area = agent.area_name || "General Territory";
  const riskData = agent.operational_metrics.risk_analysis || {};
  const liquidityData = agent.operational_metrics.liquidity_predictions || {};

  // =========================================================================
  // 1. EVALUATE BEHAVIORAL ANOMALIES (Risk Engine Output)
  // =========================================================================
  if (riskData.overall_risk_score >= 60) {
    const provider = riskData.primary_risk_provider || "Shared Reserve";
    const severity = riskData.overall_risk_score >= 80 ? "CRITICAL" : "WARNING";
    const dedupKey = createDedupKey(agent.agent_id, "BEHAVIORAL_ANOMALY", provider, severity);
    
    currentCycleKeys.add(dedupKey);

    // DEDUPLICATION CHECK: Only fire if this exact alert state isn't already active
    if (!activeAlertLedger.has(dedupKey)) {
      const alertPayload = {
        alert_id: `ALT-RISK-${Date.now().toString().slice(-4)}`,
        dedup_key: dedupKey,
        timestamp: nowIso,
        alert_type: "BEHAVIORAL_ANOMALY",
        severity: severity,
        provider: provider,
        agent_id: agent.agent_id,
        business_name: agent.business_name,
        
        // Multi-lingual Display Strings
        title: `⚠️ Unusual Activity on ${provider}`,
        message_en: `High transaction velocity and near-identical amounts detected on ${provider}. This may be normal holiday demand, but requires operational review before dispensing large cash volumes.`,
        message_banglish: `${provider}-e goto kisu shomoy dore swabhabiker cheye beshi len-den hocche. Eti Eid-er shwabhabik chahidaw hote pare, tobe boro onker nogod dewar age len-den gulo review kora dorkar.`,
        message_bn: `স্বাভাবিকের তুলনায় ${provider}-এ অনেক বেশি ক্যাশ-আউট হচ্ছে। এটি ঈদ-পূর্ব স্বাভাবিক চাহিদাও হতে পারে, তবে বড় অঙ্কের নগদ পুনরায় সরবরাহের আগে লেনদেনগুলো পর্যালোচনা করা প্রয়োজন।`,
        
        // Mandatory Explainability & Cautious AI Guardrails
        evidence: riskData.evidence || "Multiple near-identical transaction requests detected.",
        uncertainty: riskData.system_uncertainty || "Moderate - Cannot rule out regional retail spikes.",
        recommended_action: "Visually verify customer confirmations. If volume is overwhelming, forward this alert to your Field Officer for support.",
        
        // Workflow & Provider-Bound Routing Metadata
        workflow_status: "NEW_UNASSIGNED",
        can_forward: true,
        routing_target: `${provider.toUpperCase()}_FIELD_OPS_${area.toUpperCase().replace(/\s+/g, '_')}`,
        responsible_role: `${provider} Field Officer (${area})`
      };

      activeAlertLedger.set(dedupKey, alertPayload);
      newAlerts.push(alertPayload);
    }
  }

  // =========================================================================
  // 2. EVALUATE PREDICTIVE LIQUIDITY SHORTAGES (Prediction Engine Output)
  // =========================================================================
  for (const [assetName, data] of Object.entries(liquidityData)) {
    if (data.status === "CRITICAL_SHORTAGE" || data.status === "WARNING_PRESSURE") {
      const severity = data.status === "CRITICAL_SHORTAGE" ? "CRITICAL" : "WARNING";
      const dedupKey = createDedupKey(agent.agent_id, "LIQUIDITY_PRESSURE", assetName, data.status);
      
      currentCycleKeys.add(dedupKey);

      // DEDUPLICATION CHECK: Only generate if not already active in the ledger
      if (!activeAlertLedger.has(dedupKey)) {
        const minsLeft = data.minutes_remaining || 0;
        const etaString = data.eta || "Soon";
        
        // Calculate absolute target timestamp for frontend local UI countdown timers
        const targetEtaDate = new Date(now.getTime() + (minsLeft * 60 * 1000));

        const alertPayload = {
          alert_id: `ALT-LIQ-${assetName.slice(0,3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
          dedup_key: dedupKey,
          timestamp: nowIso,
          alert_type: "LIQUIDITY_PRESSURE",
          severity: severity,
          provider: assetName,
          agent_id: agent.agent_id,
          business_name: agent.business_name,
          
          // Absolute timestamp allowing frontend UI to tick countdowns locally without server polling
          target_eta_timestamp: targetEtaDate.toISOString(),
          initial_minutes_remaining: minsLeft,
          
          // Multi-lingual Display Strings
          title: `⌛ Projected Shortage: ${assetName}`,
          message_en: `At current transaction velocity, your ${assetName} balance will be depleted in ~${minsLeft} minutes (by ${etaString}).`,
          message_banglish: `Bortoman len-den er dhara anujayi ar matro ${minsLeft} minute-er moddhe (est. ${etaString}) apnar ${assetName} balance shesh hoye jete pare!`,
          message_bn: `বর্তমান লেনদেনের ধারা অনুযায়ী আগামী ${minsLeft} মিনিটের মধ্যে (${etaString}) আপনার ${assetName} ব্যালেন্স শেষ হয়ে যেতে পারে।`,
          
          // Explainability & Fallback
          evidence: data.evidence || `Net drain rate is high over the recent window.`,
          uncertainty: data.confidence ? `Data Confidence: ${data.confidence}` : "High Confidence",
          recommended_action: `Arrange additional funds. If trapped at shop due to crowd, click below to forward this alert to the ${assetName} Field Officer to request a distributor refill.`,
          
          // Workflow & Routing Metadata
          workflow_status: "NEW_UNASSIGNED",
          can_forward: true,
          routing_target: assetName === "shared_physical_cash" 
            ? `ALL_PROVIDERS_TERRITORY_OPS_${area.toUpperCase().replace(/\s+/g, '_')}`
            : `${assetName.toUpperCase()}_FIELD_OPS_${area.toUpperCase().replace(/\s+/g, '_')}`,
          responsible_role: assetName === "shared_physical_cash" 
            ? `Territory Manager (${area})` 
            : `${assetName} Field Officer (${area})`
        };

        activeAlertLedger.set(dedupKey, alertPayload);
        newAlerts.push(alertPayload);
      }
    }
  }

  // =========================================================================
  // 3. AUTO-HEALING: Clean up resolved alerts from the ledger
  // =========================================================================
  const resolvedKeys = [];
  for (const [key, storedAlert] of activeAlertLedger.entries()) {
    // If an alert belongs to this agent, but is NO LONGER in currentCycleKeys,
    // the issue has self-healed (e.g., cash deposited or velocity dropped back to normal).
    if (storedAlert.agent_id === agent.agent_id && !currentCycleKeys.has(key)) {
      activeAlertLedger.delete(key);
      resolvedKeys.push(key);
    }
  }

  // =========================================================================
  // 4. INJECT ACTIVE ALERTS DIRECTLY INTO THE AGENT OBJECT (SSOT)
  // =========================================================================
  // Gather all currently active alerts from the ledger belonging to this agent
  const currentAgentAlerts = [];
  for (const storedAlert of activeAlertLedger.values()) {
    if (storedAlert.agent_id === agent.agent_id) {
      currentAgentAlerts.push(storedAlert);
    }
  }

  // Hydrate the agent object directly so the frontend only needs one data source
  agent.active_alerts = currentAgentAlerts;

  // Return the full state payload
  return {
    updated_agent: agent,
    new_alerts: newAlerts,
    active_count: currentAgentAlerts.length,
    resolved_keys: resolvedKeys
  };
}

/**
 * Helper: Retrieves all active alerts across all agents filtered by provider.
 * Ideal for populating the Provider Field Officer / Operations Dashboard!
 * @param {string} providerName - e.g., "bKash", "Nagad", "Rocket"
 * @returns {Array} List of active alerts for that provider
 */
function getAlertsByProvider(providerName) {
  const providerAlerts = [];
  for (const alert of activeAlertLedger.values()) {
    if (alert.provider.toLowerCase() === providerName.toLowerCase()) {
      providerAlerts.push(alert);
    }
  }
  return providerAlerts;
}

/**
 * Helper: Manually clears the entire alert ledger (useful for demo resets)
 */
function resetAlertLedger() {
  activeAlertLedger.clear();
  console.log("[ALERT MANAGER] Active ledger cleared.");
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    generateActiveAlerts, 
    getAlertsByProvider, 
    resetAlertLedger, 
    activeAlertLedger 
  };
}