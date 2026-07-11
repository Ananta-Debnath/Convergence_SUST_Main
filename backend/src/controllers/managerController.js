const { readJsonDb } = require('../database/db');

const getManagers = async (req, res) => {
  try {
    const data = await readJsonDb();
    const managers = data.managers || [];
    return res.status(200).json({ status: 'ok', managers });
  } catch (err) {
    console.error('Error in getManagers controller:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

const getManagerById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readJsonDb();
    const manager = (data.managers || []).find((m) => m.manager_id === id);
    if (!manager) {
      return res.status(404).json({ status: 'error', message: 'Manager not found' });
    }
    return res.status(200).json({ status: 'ok', manager });
  } catch (err) {
    console.error('Error in getManagerById controller:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getManagers, getManagerById };
