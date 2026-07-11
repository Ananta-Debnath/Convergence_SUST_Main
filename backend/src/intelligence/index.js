const { injectAgentPredictions } = require('./predictor');
const { injectAgentRiskScore } = require('./riskEngine');
const { generateActiveAlerts } = require('./alertManager');
const { updateJsonDb, getPrimaryDbSource, getSql } = require('../database/db');

/**
 * Orchestrates intelligence processing on an agent by calling predictions,
 * risk scoring, and active alerts generation in order.
 * @param {Object} agent - The raw or partially filled agent object.
 * @returns {Object} The fully processed agent object.
 */
function processAgentIntelligence(agent) {
  if (!agent) {
    throw new Error('Agent object is required for intelligence processing.');
  }
  if (!agent.agent_id) {
    throw new Error('Agent must have an agent_id.');
  }

  // Ensure operational_metrics exists
  if (!agent.operational_metrics) {
    agent.operational_metrics = {};
  }

  // 1. Calculate and inject predictive liquidity shortages (mutates agent)
  injectAgentPredictions(agent);

  // 2. Evaluate and inject risk metrics (mutates agent)
  injectAgentRiskScore(agent);

  // 3. Generate active alerts based on predictions & risk score (mutates agent)
  const { updated_agent } = generateActiveAlerts(agent);

  return updated_agent;
}

/**
 * Processes an agent and saves it to the database (JSON DB or Postgres if configured).
 * @param {Object} agent - The agent data to process and save.
 * @returns {Promise<Object>} The processed and saved agent.
 */
async function processAndSaveAgent(agent) {
  const processedAgent = processAgentIntelligence(agent);
  const dbSource = getPrimaryDbSource();

  if (['neon', 'postgres', 'postgresql'].includes(dbSource)) {
    const sql = getSql({ required: true });
    
    try {
      await sql`
        INSERT INTO agents (
          agent_id, 
          business_name, 
          area_name, 
          last_updated, 
          balances, 
          operational_metrics, 
          recent_transactions, 
          active_alerts
        ) VALUES (
          ${processedAgent.agent_id},
          ${processedAgent.business_name || null},
          ${processedAgent.area_name || null},
          ${processedAgent.last_updated || new Date().toISOString()},
          ${JSON.stringify(processedAgent.balances || {})},
          ${JSON.stringify(processedAgent.operational_metrics || {})},
          ${JSON.stringify(processedAgent.recent_transactions || [])},
          ${JSON.stringify(processedAgent.active_alerts || [])}
        )
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
          business_name = EXCLUDED.business_name,
          area_name = EXCLUDED.area_name,
          last_updated = EXCLUDED.last_updated,
          balances = EXCLUDED.balances,
          operational_metrics = EXCLUDED.operational_metrics,
          recent_transactions = EXCLUDED.recent_transactions,
          active_alerts = EXCLUDED.active_alerts
      `;
    } catch (sqlErr) {
      console.warn('SQL execution failed or table not set up. Falling back to JSON database.', sqlErr.message);
      await saveToJsonDb(processedAgent);
    }
  } else {
    await saveToJsonDb(processedAgent);
  }

  return processedAgent;
}

async function saveToJsonDb(processedAgent) {
  await updateJsonDb((data) => {
    if (!data.agents) {
      data.agents = [];
    }
    const idx = data.agents.findIndex(a => a.agent_id === processedAgent.agent_id);
    if (idx !== -1) {
      data.agents[idx] = processedAgent;
    } else {
      data.agents.push(processedAgent);
    }
    return data;
  });
}

module.exports = {
  processAgentIntelligence,
  processAndSaveAgent,
};
