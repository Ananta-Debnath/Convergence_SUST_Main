const express = require('express');
const alertController = require('../controllers/alertController');

const router = express.Router();

router.post('/alerts/analyze', alertController.analyzeAlerts);
router.get('/agents/:id/alerts', alertController.getAgentAlerts);

module.exports = router;
