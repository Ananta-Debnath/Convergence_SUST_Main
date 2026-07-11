const test = require('node:test');
const assert = require('node:assert/strict');

const {
  anomalityAlert,
  calculateSeverity,
  detectAnomalies,
  generateGeminiMessage,
} = require('../src/services/anomalityAlert');
const { analyzeAlerts } = require('../src/controllers/alertController');

const AGENT = { agent_id: 'AGT-8472' };
const START = Date.parse('2026-07-11T10:00:00.000Z');

function transaction(index, overrides = {}) {
  return {
    transaction_id: `TX-${index}`,
    provider_id: 'Nagad',
    user_id: `USER-${index}`,
    time: new Date(START + index * 60 * 1000).toISOString(),
    transaction_type: 'cash-out',
    amount: 9999,
    status: 'success',
    ...overrides,
  };
}

function alertsFor(transactions, extra = {}) {
  return detectAnomalies({ agent: AGENT, transactions, ...extra }).alerts;
}

test('clone pattern requires five equal-type/equal-amount transactions in under ten minutes', () => {
  const transactions = Array.from({ length: 5 }, (_, index) => transaction(index));
  const alert = alertsFor(transactions).find((item) => item.pattern === 'clone_pattern');

  assert.ok(alert);
  assert.equal(alert.metrics.count, 5);
  assert.equal(alert.metrics.amount, 9999);
  assert.equal(alert.severity.level, 'high');
  assert.deepEqual(alert.transaction_ids, ['TX-0', 'TX-1', 'TX-2', 'TX-3', 'TX-4']);
});

test('clone pattern does not trigger at the count or time boundary', () => {
  assert.equal(
    alertsFor(Array.from({ length: 4 }, (_, index) => transaction(index)))
      .some((item) => item.pattern === 'clone_pattern'),
    false,
  );

  const boundaryTransactions = [0, 1, 2, 3, 10].map((minute, index) => transaction(index, {
    time: new Date(START + minute * 60 * 1000).toISOString(),
  }));
  assert.equal(
    alertsFor(boundaryTransactions).some((item) => item.pattern === 'clone_pattern'),
    false,
  );
});

test('transaction splitting detects four transactions for one user in under five minutes', () => {
  const transactions = Array.from({ length: 4 }, (_, index) => transaction(index, {
    user_id: 'USER-SPLIT',
    amount: 10000 + index,
  }));
  const alert = alertsFor(transactions).find((item) => item.pattern === 'smurfing_pattern');

  assert.ok(alert);
  assert.equal(alert.entity_id, 'USER-SPLIT');
  assert.equal(alert.metrics.totalAmount, 40006);
});

test('user anomaly stays directly on agent.anomality_alert', () => {
  const agent = {
    agent_id: 'AGT-8472',
    business_name: 'Molla Telecom',
    area_name: 'Sylhet Sadar',
  };
  const transactions = Array.from({ length: 4 }, (_, index) => transaction(index, {
    user_id: '01711223344',
    amount: 10000 + index,
  }));
  const result = detectAnomalies({ agent, transactions });
  const anomalityAlert = result.agent.anomality_alert[0];

  assert.equal(anomalityAlert.alert_type, 'SMURFING_PATTERN');
  assert.equal(anomalityAlert.severity, 'HIGH');
  assert.equal(anomalityAlert.user_id, '01711223344');
  assert.equal(anomalityAlert.agent_id, 'AGT-8472');
  assert.equal(anomalityAlert.business_name, 'Molla Telecom');
  assert.equal(anomalityAlert.recipient_type, 'agent');
  assert.equal(anomalityAlert.routing_target, 'AGT-8472');
  assert.equal(anomalityAlert.workflow_status, 'NEW_AGENT_REVIEW');
  assert.match(anomalityAlert.message_en, /review/i);
  assert.match(anomalityAlert.message_bn, /[\u0980-\u09FF]/u);
  assert.match(anomalityAlert.message_bn, /পর্যালোচনা/u);
  assert.match(anomalityAlert.message_banglish, /review/i);
  assert.doesNotMatch(anomalityAlert.message_banglish, /[\u0980-\u09FF]/u);
  assert.equal(result.agent.anomality_alert.length, 1);
  assert.equal(result.manager.anomality_alert.length, 0);
  assert.equal(Object.hasOwn(result, 'active_alerts'), false);
  assert.equal(Object.hasOwn(result, 'anomality_alert'), false);
  assert.equal(Object.hasOwn(result, 'anomality_alert_inboxes'), false);
});

test('agent anomaly stays directly on manager.anomality_alert', () => {
  const agent = {
    agent_id: 'AGT-TEST-99',
    business_name: 'Sylhet Telecom Hub',
    area_name: 'Sylhet Sadar',
  };
  const manager = {
    manager_id: 'MGR-SYLHET-01',
    managed_region: 'Sylhet Sadar',
  };
  const transactions = Array.from({ length: 5 }, (_, index) => transaction(index, {
    user_id: `0170000000${index}`,
  }));
  const result = detectAnomalies({ agent, manager, transactions });
  const anomalityAlert = result.manager.anomality_alert[0];

  assert.equal(anomalityAlert.alert_type, 'CLONE_PATTERN');
  assert.equal(anomalityAlert.recipient_type, 'manager');
  assert.equal(anomalityAlert.routing_target, 'MGR-SYLHET-01');
  assert.equal(anomalityAlert.responsible_role, 'Territory Manager (Sylhet Sadar)');
  assert.equal(anomalityAlert.workflow_status, 'NEW_UNASSIGNED');
  assert.match(anomalityAlert.message_en, /review/i);
  assert.match(anomalityAlert.message_bn, /[\u0980-\u09FF]/u);
  assert.match(anomalityAlert.message_banglish, /review/i);
  assert.match(anomalityAlert.dedup_key, /^AGT-TEST-99:CLONE_PATTERN:/);
  assert.equal(result.agent.anomality_alert.length, 0);
  assert.equal(result.manager.anomality_alert.length, 1);
  assert.equal(Object.hasOwn(result, 'active_alerts'), false);
  assert.equal(Object.hasOwn(result, 'anomality_alert'), false);
  assert.equal(Object.hasOwn(result, 'anomality_alert_inboxes'), false);
});

test('velocity detects eight rapid transactions by one user', () => {
  const transactions = Array.from({ length: 8 }, (_, index) => transaction(index, {
    user_id: 'USER-FAST',
    amount: 1000 + index,
    provider_id: index % 2 ? 'Nagad' : 'bKash',
    transaction_type: index % 2 ? 'cash-out' : 'cash-in',
  }));
  const alert = alertsFor(transactions).find((item) => item.pattern === 'unusual_velocity');

  assert.ok(alert);
  assert.equal(alert.metrics.providerCount, 2);
  assert.deepEqual(alert.metrics.transactionTypes.sort(), ['cash-in', 'cash-out']);
});

test('time anomaly uses the configured Bangladesh offset for a high-value transaction', () => {
  const transactions = [transaction(0, {
    amount: 60000,
    time: '2026-07-11T21:15:00.000Z', // 03:15 at UTC+6
  })];
  const alert = alertsFor(transactions).find((item) => item.pattern === 'time_anomaly');

  assert.ok(alert);
  assert.equal(alert.metrics.localHour, 3);
});

test('balance inconsistency compares an open shortage request with provider e-money', () => {
  const agent = {
    agent_id: 'AGT-BALANCE',
    balances: { provider_e_money: { Nagad: 80000 } },
    support_requests: [{
      ticket_id: 'TICKET-1',
      provider_id: 'Nagad',
      status: 'open',
      priority: 'urgent',
      reason: 'Out of e-money',
    }],
  };
  const alert = detectAnomalies({ agent, transactions: [], now: START }).alerts
    .find((item) => item.pattern === 'balance_inconsistency');

  assert.ok(alert);
  assert.equal(alert.metrics.balance, 80000);
  assert.equal(alert.support_request_id, 'TICKET-1');
});

test('abnormal failure rate detects twenty consecutive failures within fifteen minutes', () => {
  const transactions = Array.from({ length: 20 }, (_, index) => transaction(index, {
    time: new Date(START + index * 30 * 1000).toISOString(),
    status: 'failed',
    amount: 1000 + index,
  }));
  const alert = alertsFor(transactions).find((item) => item.pattern === 'abnormal_failure_rate');

  assert.ok(alert);
  assert.equal(alert.metrics.consecutiveCount, 20);
});

test('severity is deterministic and does not depend on generated wording', () => {
  assert.deepEqual(
    calculateSeverity('clone_pattern', { count: 6, threshold: 5, amount: 100000, providerCount: 2, veryRapid: true }),
    calculateSeverity('clone_pattern', { count: 6, threshold: 5, amount: 100000, providerCount: 2, veryRapid: true }),
  );
});

test('Gemini prompt does not allow liquidity calculation or control', () => {
  const { GEMINI_SYSTEM_PROMPT } = require('../src/services/anomalityAlert');
  assert.match(GEMINI_SYSTEM_PROMPT, /Do not calculate, predict, modify, or control liquidity/i);
});

test('Gemini structured output is validated and accepted', async () => {
  const sourceAlert = alertsFor(Array.from({ length: 5 }, (_, index) => transaction(index)))[0];
  const expected = {
    subject: 'Unusual Activity Requiring Human Review',
    evidence: 'Five equal-value cash-outs occurred in four minutes.',
    context: 'This may be normal demand or a data issue.',
    recommended_action: 'A field worker must complete a human review of the logs.',
    message_en: 'Five equal-value cash-outs occurred in four minutes. This may be normal demand or a data issue. A responsible person must review the logs before action.',
    message_bn: 'গত চার মিনিটে একই পরিমাণের পাঁচটি ক্যাশ-আউট হয়েছে। এটি স্বাভাবিক চাহিদা বা ডেটার সমস্যাও হতে পারে। পরবর্তী পদক্ষেপের আগে একজন দায়িত্বপ্রাপ্ত কর্মীকে লেনদেনগুলো পর্যালোচনা করতে হবে।',
    message_banglish: 'Goto char minute-e eki porimaner pachti cash-out hoyeche. Eti shabhabik demand ba data problem-o hote pare. Poroborti podokkhep-er age ekjon dayittoprapto person-ke transaction-gulo review korte hobe.',
  };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(expected) }] } }],
    }),
  });

  const message = await generateGeminiMessage(sourceAlert, { apiKey: 'test-key', fetchImpl });
  assert.deepEqual(message, expected);
});

test('unsafe Gemini wording falls back to deterministic safe language', async () => {
  const transactions = Array.from({ length: 5 }, (_, index) => transaction(index));
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        subject: 'Possible fraud',
        evidence: 'Five transactions.',
        context: 'Unknown.',
        recommended_action: 'A human should review this.',
        message_en: 'Five transactions occurred. A human must review them.',
        message_bn: 'লেনদেনগুলো পর্যালোচনা করা প্রয়োজন।',
        message_banglish: 'Transaction-gulo review kora proyojon.',
      }) }] } }],
    }),
  });

  const result = await anomalityAlert(
    { agent: AGENT, transactions },
    { apiKey: 'test-key', fetchImpl },
  );

  assert.equal(result.alerts[0].message_source, 'deterministic_fallback');
  assert.doesNotMatch(
    `${result.alerts[0].subject} ${result.alerts[0].evidence} ${result.alerts[0].context}`,
    /\b(fraud|illegal|crime)\b/i,
  );
  assert.match(result.alerts[0].message_en, /review/i);
  assert.match(result.alerts[0].message_bn, /পর্যালোচনা/u);
  assert.match(result.alerts[0].message_banglish, /review/i);
});

test('alert controller returns the structured analysis response', async () => {
  let statusCode;
  let payload;
  const req = {
    body: {
      agent: AGENT,
      transactions: Array.from({ length: 5 }, (_, index) => transaction(index)),
      use_gemini: false,
    },
    query: {},
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };

  await analyzeAlerts(req, res);

  assert.equal(statusCode, 200);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.alert_count, 1);
  assert.equal(payload.alerts[0].pattern, 'clone_pattern');
  assert.match(payload.alerts[0].recommended_action, /human review/i);
  assert.equal(payload.manager.anomality_alert[0].recipient_type, 'manager');
});
