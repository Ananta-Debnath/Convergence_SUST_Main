const express = require('express');
const managerController = require('../controllers/managerController');

const router = express.Router();

router.get('/managers', managerController.getManagers);
router.get('/managers/:id', managerController.getManagerById);

module.exports = router;
