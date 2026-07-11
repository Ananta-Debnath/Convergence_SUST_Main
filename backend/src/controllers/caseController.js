const { readJsonDb } = require('../database/db');

/**
 * Get all cases.
 */
const getCases = async (req, res) => {
  try {
    const data = await readJsonDb();
    const cases = data.cases || [];
    
    return res.status(200).json({
      status: 'ok',
      cases,
    });
  } catch (err) {
    console.error('Error in getCases controller:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

/**
 * Get a single case by ID.
 */
const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readJsonDb();
    const singleCase = data.cases?.find(c => c.case_id === id);

    if (!singleCase) {
      return res.status(404).json({
        status: 'error',
        message: 'Case not found',
      });
    }

    return res.status(200).json({
      status: 'ok',
      case: singleCase,
    });
  } catch (err) {
    console.error('Error in getCaseById controller:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
};

module.exports = {
  getCases,
  getCaseById,
};
