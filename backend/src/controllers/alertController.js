const { readJsonDb } = require('../database/db');
const { anomalityAlert } = require('../services/anomalityAlert');

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

async function findStoredAgent(agentId) {
  if (!agentId) return null;
  const data = await readJsonDb();
  return data.agents?.find((agent) => agent.agent_id === agentId) || null;
}

/** POST /alerts/analyze - analyze supplied or stored agent activity. */
const analyzeAlerts = async (req, res) => {
  try {
    const body = req.body || {};
    const requestedAgentId = body.agent_id || body.agentId;
    let agent = body.agent;

    if (!agent && requestedAgentId) {
      agent = await findStoredAgent(requestedAgentId);
      if (!agent && !Array.isArray(body.transactions)) {
        return res.status(404).json({ status: 'error', message: 'Agent not found' });
      }
    }

    // A full agent object may also be posted directly for batch/replay usage.
    if (!agent && Array.isArray(body.recent_transactions)) agent = body;
    if (!agent) agent = { agent_id: requestedAgentId || 'unknown-agent' };

    const result = await anomalityAlert({
      agent,
      manager: body.manager,
      transactions: body.transactions,
      supportRequests: body.support_requests || body.supportRequests,
      now: body.now,
      config: body.config,
      useGemini: parseBoolean(body.use_gemini ?? body.useGemini, true),
    }, {
      useGemini: parseBoolean(
        req.query.use_gemini ?? req.query.useGemini,
        parseBoolean(body.use_gemini ?? body.useGemini, true),
      ),
    });

    return res.status(200).json({ status: 'ok', ...result });
  } catch (error) {
    console.error('Error in analyzeAlerts controller:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Unable to analyze anomaly alerts',
    });
  }
};

/** GET /agents/:id/alerts - analyze the agent currently stored in data.json. */
const getAgentAlerts = async (req, res) => {
  try {
    const agent = await findStoredAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ status: 'error', message: 'Agent not found' });
    }

    const result = await anomalityAlert({
      agent,
      now: req.query.now,
      useGemini: parseBoolean(req.query.use_gemini ?? req.query.useGemini, true),
    }, {
      useGemini: parseBoolean(req.query.use_gemini ?? req.query.useGemini, true),
    });

    return res.status(200).json({ status: 'ok', ...result });
  } catch (error) {
    console.error('Error in getAgentAlerts controller:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Unable to analyze anomaly alerts',
    });
  }
};

module.exports = {
  analyzeAlerts,
  getAgentAlerts,
};
