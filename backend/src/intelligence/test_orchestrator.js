const { processAgentIntelligence, processAndSaveAgent } = require('./index');
const { readJsonDb } = require('../database/db');

async function runTest() {
  console.log('--- Starting Intelligence Orchestrator Test ---');

  // Define a sample raw agent with transaction anomalies (Eid-rush risk) and low balances (liquidity crunch)
  const testAgent = {
    agent_id: "AGT-TEST-99",
    business_name: "Sylhet Telecom Hub",
    area_name: "Sylhet Sadar",
    last_updated: new Date().toISOString(),
    balances: {
      shared_physical_cash: 50000,
      provider_e_money: {
        bKash: 3000, // Very low balance
        Nagad: 20000,
        Rocket: 15000
      }
    },
    recent_transactions: [
      // Simulate recent transactions on bKash showing high cash-out (draining bKash e-money)
      { transaction_id: "TXN-T01", provider_id: "bKash", amount: 1500, time: new Date(Date.now() - 10 * 60000).toISOString(), transaction_type: "cash-in", status: "success" },
      { transaction_id: "TXN-T02", provider_id: "bKash", amount: 8000, time: new Date(Date.now() - 8 * 60000).toISOString(), transaction_type: "cash-out", status: "success" },
      { transaction_id: "TXN-T03", provider_id: "bKash", amount: 8000, time: new Date(Date.now() - 6 * 60000).toISOString(), transaction_type: "cash-out", status: "success" },
      { transaction_id: "TXN-T04", provider_id: "bKash", amount: 8000, time: new Date(Date.now() - 4 * 60000).toISOString(), transaction_type: "cash-out", status: "success" },
      { transaction_id: "TXN-T05", provider_id: "bKash", amount: 8000, time: new Date(Date.now() - 2 * 60000).toISOString(), transaction_type: "cash-out", status: "success" }
    ]
  };

  console.log('Original agent balances:', JSON.stringify(testAgent.balances));

  // 1. Process intelligence
  console.log('Running processAgentIntelligence...');
  const processed = await processAgentIntelligence(testAgent);

  console.log('\nProcessed operational_metrics:');
  console.log(JSON.stringify(processed.operational_metrics, null, 2));

  console.log('\nProcessed active_alerts:');
  console.log(JSON.stringify(processed.active_alerts, null, 2));

  // Verify that predicted liquidity shortage and risk analysis are injected
  if (!processed.operational_metrics.liquidity_predictions) {
    throw new Error('Test failed: liquidity_predictions not injected!');
  }
  if (!processed.operational_metrics.risk_analysis) {
    throw new Error('Test failed: risk_analysis not injected!');
  }

  // 2. Save to DB
  console.log('\nSaving processed agent to DB...');
  await processAndSaveAgent(processed);

  // 3. Read back and verify
  console.log('Reading from DB to verify save...');
  const dbData = await readJsonDb();
  const savedAgent = dbData.agents.find(a => a.agent_id === "AGT-TEST-99");

  if (!savedAgent) {
    throw new Error('Test failed: Agent was not saved in DB!');
  }

  console.log('Verification Success! Saved agent ID:', savedAgent.agent_id);
  console.log('Saved agent business name:', savedAgent.business_name);
  console.log('--- Intelligence Orchestrator Test Completed Successfully ---');
}

runTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
