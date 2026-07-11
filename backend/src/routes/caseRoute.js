const express = require('express');
const caseController = require('../controllers/caseController');

const router = express.Router();

router.get('/cases', caseController.getCases);
router.get('/cases/:id', caseController.getCaseById);

module.exports = router;
