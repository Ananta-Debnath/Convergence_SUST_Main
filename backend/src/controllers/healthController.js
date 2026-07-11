const {
  getPrimaryDbSource,
  testPrimaryDbConnection,
  testSqlConnection,
} = require('../database/db');

const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

const testDb = async (req, res) => {
  try {
    const result = await testPrimaryDbConnection();

    res.status(200).json({
      status: 'ok',
      db: 'connected',
      primary: getPrimaryDbSource(),
      ...result,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: 'disconnected',
      message: err.message,
    });
  }
};

const testSqlDb = async (req, res) => {
  try {
    const result = await testSqlConnection();

    res.status(200).json({
      status: 'ok',
      db: 'connected',
      ...result,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: 'disconnected',
      source: 'neon',
      message: err.message,
    });
  }
};

module.exports = { getHealth, testDb, testSqlDb };
