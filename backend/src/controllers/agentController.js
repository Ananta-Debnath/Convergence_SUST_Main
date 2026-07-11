const {
  getPrimaryDbSource,
  readJsonDb,
  getSql,
} = require('../database/db');
const { processAndSaveAgent } = require('../intelligence');

/**
 * Get all agents. Currently returns only the agent 'id'.
 * Supports both Postgres (Neon) and local JSON file database sources.
 */
const getAgents = async (req, res) => {
  try {
    const data = await readJsonDb();
    const agents = data.agents || [];
    
    return res.status(200).json({
    status: 'ok',
    agents,
    });
  } catch (err) {
    console.error('Error in getAgents controller:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

const getAgentById = async (req, res) => {
    const { id } = req.params;
    const data = await readJsonDb();
    const agent = data.agents?.find(a => a.agent_id === id);

    if (!agent) {
        return res.status(404).json({
            status: 'error',
            message: 'Agent not found',
        });
    }

    return res.status(200).json({
        status: 'ok',
        agent,
    });
};

const createOrUpdateAgent = async (req, res) => {
  try {
    const agentData = req.body;
    if (!agentData || !agentData.agent_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Agent data with agent_id is required.',
      });
    }

    const savedAgent = await processAndSaveAgent(agentData);

    return res.status(200).json({
      status: 'ok',
      agent: savedAgent,
    });
  } catch (err) {
    console.error('Error in createOrUpdateAgent controller:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

module.exports = {
  getAgents,
  getAgentById,
  createOrUpdateAgent,
};

