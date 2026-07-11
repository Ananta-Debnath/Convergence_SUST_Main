const express = require('express');
const areaAlertController = require('../controllers/areaAlertController');

const router = express.Router();

router.get('/area-alerts', areaAlertController.getAllAreaAlerts);
router.get('/areas/:areaName/alerts', areaAlertController.getAreaAlerts);
router.get('/regions/:region/alerts', areaAlertController.getRegionAlerts);

module.exports = router;
