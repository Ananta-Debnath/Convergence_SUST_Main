const { getSql } = require('../database/db');

const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

const testDb = async (req, res) => {
  try {
    const sql = getSql();
    const result = await sql`SELECT NOW() AS now, version() AS version`;
    const row = result[0] || {};
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      now: row.now,
      version: row.version,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: 'disconnected',
      message: err.message,
    });
  }
};

module.exports = { getHealth, testDb };