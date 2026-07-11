const express = require('express');
const { getHealth, testDb, testSqlDb } = require('../controllers/healthController');

const router = express.Router();

router.get('/health', getHealth);
router.get('/test-db', testDb);
router.get('/test-sql-db', testSqlDb);

module.exports = router;
