// Load env vars from a local .env file if present.
// Safe to require even if dotenv isn't installed yet.
try {
  require('dotenv').config();
} catch (_) {
  // dotenv not installed yet; rely on real env vars
}

const express = require('express');
const healthRoutes = require('./routes/healthRoutes.js');
const agentRoute = require('./routes/agentRoute.js');
const caseRoute = require('./routes/caseRoute.js');
const fieldWorkerRoute = require('./routes/fieldWorkerRoute.js');
const managerRoute = require('./routes/managerRoute.js');
const { readJsonDb } = require('./database/db.js');
const { processAndSaveAgent } = require('./intelligence/index.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/', healthRoutes);
app.use('/', agentRoute);
app.use('/', caseRoute);
app.use('/', fieldWorkerRoute);
app.use('/', managerRoute);

/**
 * Runs the intelligence pipeline on any agents that have not yet been
 * enriched (i.e., they lack computed liquidity_predictions). This runs
 * once on startup after data.json has been initialised from seedData.
 */
async function initializeData() {
  try {
    const db = await readJsonDb();
    const agents = db.agents || [];

    const unprocessed = agents.filter(
      (a) => !a.operational_metrics?.liquidity_predictions
    );

    if (unprocessed.length === 0) {
      console.log('[Init] All agents already processed — skipping intelligence pipeline.');
      return;
    }

    console.log(`[Init] Running intelligence pipeline on ${unprocessed.length} agent(s)...`);

    for (const agent of unprocessed) {
      try {
        await processAndSaveAgent(agent);
        console.log(`[Init]   ✓ Processed agent ${agent.agent_id}`);
      } catch (agentErr) {
        console.warn(`[Init]   ⚠ Failed to process agent ${agent.agent_id}:`, agentErr.message);
      }
    }

    console.log('[Init] Intelligence pipeline complete.');
  } catch (err) {
    console.error('[Init] Data initialization failed:', err.message);
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  await initializeData();
});