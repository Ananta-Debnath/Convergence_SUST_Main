const { readJsonDb } = require('../database/db');

const getFieldWorkers = async (req, res) => {
  try {
    const data = await readJsonDb();
    const fieldWorkers = data.field_workers || [];
    return res.status(200).json({ status: 'ok', field_workers: fieldWorkers });
  } catch (err) {
    console.error('Error in getFieldWorkers controller:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

const getFieldWorkerById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readJsonDb();
    const worker = (data.field_workers || []).find((w) => w.worker_id === id);
    if (!worker) {
      return res.status(404).json({ status: 'error', message: 'Field worker not found' });
    }
    return res.status(200).json({ status: 'ok', field_worker: worker });
  } catch (err) {
    console.error('Error in getFieldWorkerById controller:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getFieldWorkers, getFieldWorkerById };
