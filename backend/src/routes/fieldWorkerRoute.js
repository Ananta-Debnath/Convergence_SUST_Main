const express = require('express');
const fieldWorkerController = require('../controllers/fieldWorkerController');

const router = express.Router();

router.get('/field-workers', fieldWorkerController.getFieldWorkers);
router.get('/field-workers/:id', fieldWorkerController.getFieldWorkerById);

module.exports = router;
