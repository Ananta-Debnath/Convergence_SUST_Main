const express = require('express');
const agentController = require('../controllers/agentController');

const router = express.Router();

router.get('/agents', agentController.getAgents);
router.get('/agents/:id', agentController.getAgentById);

module.exports = router;
