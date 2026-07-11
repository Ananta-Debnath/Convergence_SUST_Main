const { injectAgentRiskScore } = require('./riskEngine.js');

// 1. Your sample agent object (with an injected anomaly scenario on Nagad for testing)
let sampleAgent = {
  "agent_id": "AGT-8472",
  "business_name": "Molla Telecom",
  "balances": {
    "shared_physical_cash": 125000,
    "provider_e_money": { "bKash": 15000, "Nagad": 8500, "Rocket": 32000 }
  },
  "recent_transactions": [
    { "transaction_id": "TXN-9901", "provider_id": "bKash", "amount": 10000, "status": "success", "customer_id": "CUST-101" },
    // Simulating an Eid-rush anomaly cluster on Nagad[cite: 1]
    { "transaction_id": "TXN-9902", "provider_id": "Nagad", "amount": 4950, "status": "success", "customer_id": "CUST-882" },
    { "transaction_id": "TXN-9903", "provider_id": "Nagad", "amount": 4950, "status": "success", "customer_id": "CUST-882" },
    { "transaction_id": "TXN-9904", "provider_id": "Nagad", "amount": 5000, "status": "success", "customer_id": "CUST-882" },
    { "transaction_id": "TXN-9905", "provider_id": "Nagad", "amount": 4950, "status": "success", "customer_id": "CUST-901" }
  ]
};

// 2. Run the risk scorer (mutates the object inline)
injectAgentRiskScore(sampleAgent);

// 3. Inspect the newly added risk_analysis data
console.log(JSON.stringify(sampleAgent.operational_metrics.risk_analysis, null, 2));