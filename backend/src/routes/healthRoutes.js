const express = require('express');
const { getHealth, testDb } = require('../controllers/healthController');

const router = express.Router();

router.get('/health', getHealth);
router.get('/test-db', testDb);

module.exports = router;