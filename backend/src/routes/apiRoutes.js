const express = require('express');
const {
  getActiveTickets,
  getTicketById,
  updateTicketStatus,
  addMessage,
  getMessages,
  getOfficerView,
} = require('../controllers/ticketController');

const router = express.Router();

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

router.get('/tickets', asyncHandler(getActiveTickets));
router.get('/tickets/:ticketId', asyncHandler(getTicketById));
router.put('/tickets/:ticketId/status', asyncHandler(updateTicketStatus));
router.post('/tickets/:ticketId/messages', asyncHandler(addMessage));
router.get('/tickets/:ticketId/messages', asyncHandler(getMessages));
router.get('/agent/:agentId/officer-view', asyncHandler(getOfficerView));

module.exports = router;
