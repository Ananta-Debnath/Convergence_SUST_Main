const crypto = require('crypto');

/**
 * Anomaly Alert Service
 * ---------------------
 * Processing flow:
 * 1. Normalize transaction fields from the different supported JSON shapes.
 * 2. Keep transactions inside the active analysis window.
 * 3. Run each deterministic anomaly rule independently.
 * 4. Calculate an auditable severity score and build a safe fallback message.
 * 5. Optionally ask Gemini to rewrite only the human-facing message fields.
 *
 * Important: Gemini never decides whether an anomaly exists and never assigns
 * severity. Those decisions remain deterministic and testable in this file.
 */

const MINUTE_MS = 60 * 1000;

// Default thresholds. Callers may override these through input.config.
const DEFAULT_CONFIG = Object.freeze({
  // Only transactions in this outer window are passed to the rule detectors.
  analysisWindowMinutes: 15,
  // "More than 4 in under 10 minutes" means a minimum count of 5.
  cloneWindowMinutes: 10,
  cloneMinimumCount: 5,
  // "More than 3 in under 5 minutes" means a minimum count of 4.
  smurfingWindowMinutes: 5,
  smurfingMinimumCount: 4,
  velocityWindowMinutes: 15,
  velocityMinimumCount: 8,
  failureWindowMinutes: 15,
  failureMinimumCount: 20,
  highValueAmount: 50000,
  highBalanceAmount: 25000,
  oddHourStart: 23,
  oddHourEnd: 6,
  // Bangladesh Standard Time is UTC+6, or 360 minutes ahead of UTC.
  timezoneOffsetMinutes: 360,
});

// Internal rule keys are mapped to readable names used in alert messages.
const PATTERN_NAMES = Object.freeze({
  clone_pattern: 'Clone Pattern',
  smurfing_pattern: 'Transaction Splitting',
  unusual_velocity: 'Unusual Transaction Velocity',
  time_anomaly: 'Time Anomaly',
  balance_inconsistency: 'Balance Inconsistency',
  abnormal_failure_rate: 'Abnormal Failure Rate',
  area_velocity_surge: 'Area Velocity Surge',
  area_coordinated_pattern: 'Area Coordinated Pattern',
  regional_cascade: 'Regional Cascade',
});

// Every pattern starts from a risk-informed baseline before evidence modifiers.
const BASE_SEVERITY = Object.freeze({
  clone_pattern: 55,
  smurfing_pattern: 62,
  unusual_velocity: 58,
  time_anomaly: 64,
  balance_inconsistency: 68,
  abnormal_failure_rate: 72,
  area_velocity_surge: 70,
  area_coordinated_pattern: 75,
  regional_cascade: 82,
});

// ---------------------------------------------------------------------------
// Normalization and shared helpers
// ---------------------------------------------------------------------------

/** Convert a Date, numeric timestamp, or ISO date string into milliseconds. */
function toTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Make cash_in, cash in, and cash-in resolve to the same canonical value. */
function normalizeTransactionType(value) {
  const normalized = String(value || 'transaction')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

  if (normalized === 'cashin') return 'cash-in';
  if (normalized === 'cashout') return 'cash-out';
  return normalized;
}

/** Return the first usable value; useful when external payload schemas differ. */
function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

/** Support both the data.json and standalone agent.json agent shapes. */
function getAgentId(agent = {}) {
  return firstDefined(agent.agent_id, agent.agentId, agent.agent_profile?.agent_id, 'unknown-agent');
}

/** Read dashboard labels from either supported agent JSON shape. */
function getBusinessName(agent = {}) {
  return firstDefined(agent.business_name, agent.businessName, agent.agent_profile?.business_name, 'Unknown business');
}

function getAreaName(agent = {}) {
  return firstDefined(agent.area_name, agent.areaName, agent.agent_profile?.area_name, 'Unassigned area');
}

/** Convert a human label such as "Sylhet Sadar" into a routing-safe token. */
function routingToken(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convert a raw transaction to the one internal shape used by every rule.
 * `userId` represents the customer's phone number (for example 01711223344).
 * It is intentionally kept as a string so a leading zero is never lost.
 * Phone formats are compared exactly, so upstream data should use one format.
 */
function normalizeTransaction(transaction, index, agentId) {
  const timestamp = toTimestamp(firstDefined(
    transaction.time,
    transaction.timestamp,
    transaction.created_at,
    transaction.createdAt,
  ));
  const rawAmount = Number(firstDefined(transaction.amount, transaction.transaction_amount));
  const failureDetails = [
    transaction.failure_reason,
    transaction.error_code,
    transaction.error_message,
    ...(Array.isArray(transaction.event_flags) ? transaction.event_flags : []),
  ].filter(Boolean).join(' ');
  const suppliedStatus = firstDefined(transaction.status, transaction.result);
  const status = String(suppliedStatus || (failureDetails ? 'failed' : 'success')).trim().toLowerCase();
  const successful = ['success', 'successful', 'completed', 'approved'].includes(status);
  // Failure details also catch values such as "insufficient funds" or bad PIN.
  const failed = !successful && /fail|declin|reject|error|insufficient|incorrect|invalid/i
    .test(`${status} ${failureDetails}`);

  return {
    original: transaction,
    index,
    id: String(firstDefined(transaction.transaction_id, transaction.id, `transaction-${index + 1}`)),
    agentId: String(firstDefined(transaction.agent_id, transaction.agentId, agentId)),
    provider: String(firstDefined(transaction.provider_id, transaction.provider, transaction.channel, 'unknown')),
    // These alternatives let API clients use common customer identifier names.
    userId: firstDefined(
      transaction.user_id,
      transaction.userId,
      transaction.customer_id,
      transaction.customerId,
      transaction.wallet_owner_id,
    ),
    timestamp,
    time: timestamp === null ? null : new Date(timestamp).toISOString(),
    type: normalizeTransactionType(firstDefined(transaction.transaction_type, transaction.type)),
    amount: Number.isFinite(rawAmount) && rawAmount >= 0 ? rawAmount : null,
    status,
    successful,
    failed,
  };
}

/** Group records without depending on a third-party utility library. */
function groupBy(items, keyFactory) {
  const groups = new Map();

  for (const item of items) {
    const key = keyFactory(item);
    if (key === null || key === undefined) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return groups;
}

/**
 * Return the densest sliding window in O(n log n) time (sorting dominates).
 * The `>=` removal is deliberate: a rule saying "under 10 minutes" must not
 * include two transactions that are exactly 10 minutes apart.
 */
function densestWindow(items, windowMinutes) {
  if (!items.length) return [];

  const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp);
  const windowMs = windowMinutes * MINUTE_MS;
  let left = 0;
  let bestStart = 0;
  let bestEnd = -1;

  // Move `right` forward and shrink `left` until the active window is valid.
  for (let right = 0; right < sorted.length; right += 1) {
    while (left <= right && sorted[right].timestamp - sorted[left].timestamp >= windowMs) {
      left += 1;
    }

    if (right - left > bestEnd - bestStart) {
      bestStart = left;
      bestEnd = right;
    }
  }

  return bestEnd >= bestStart ? sorted.slice(bestStart, bestEnd + 1) : [];
}

function formatAmount(amount) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} BDT`;
}

function describeType(type, count) {
  const label = type === 'transaction' ? 'transaction' : type;
  return count === 1 ? label : `${label}s`;
}

function durationMinutes(transactions) {
  if (transactions.length < 2) return 0;
  return (transactions[transactions.length - 1].timestamp - transactions[0].timestamp) / MINUTE_MS;
}

function providerNames(transactions) {
  return [...new Set(transactions.map((transaction) => transaction.provider).filter(Boolean))];
}

function severityLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Severity and common alert construction
// ---------------------------------------------------------------------------

/**
 * Produces an auditable severity score. Gemini is deliberately not involved in
 * this calculation so the same evidence always receives the same priority.
 */
function calculateSeverity(pattern, metrics = {}) {
  let score = BASE_SEVERITY[pattern] || 40;
  const factors = [`${PATTERN_NAMES[pattern] || pattern} baseline`];
  const count = Number(metrics.count || 0);
  const threshold = Number(metrics.threshold || 0);
  const totalAmount = Number(metrics.totalAmount || 0);
  const amount = Number(metrics.amount || 0);

  // Extra events above a rule threshold raise severity, with a capped bonus.
  if (threshold > 0 && count > threshold) {
    const addition = Math.min(12, (count - threshold) * 3);
    score += addition;
    factors.push(`event count is ${count - threshold} above the trigger`);
  }

  // Larger values create more operational exposure and therefore add weight.
  if (totalAmount >= 100000 || amount >= 100000) {
    score += 14;
    factors.push('value exposure is at least 100,000 BDT');
  } else if (totalAmount >= 50000 || amount >= 50000) {
    score += 10;
    factors.push('value exposure is at least 50,000 BDT');
  } else if (totalAmount >= 25000 || amount >= 25000) {
    score += 6;
    factors.push('value exposure is at least 25,000 BDT');
  }

  if (Number(metrics.providerCount || 0) > 1) {
    score += 4;
    factors.push('activity spans multiple providers');
  }

  if (metrics.veryRapid) {
    score += 5;
    factors.push('activity occurred in half or less of the rule window');
  }

  if (Number(metrics.consecutiveCount || 0) >= 25) {
    score += 8;
    factors.push('at least 25 consecutive attempts failed');
  }

  if (Number(metrics.balance || 0) >= 100000) {
    score += 8;
    factors.push('recorded balance is at least 100,000 BDT');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, level: severityLevel(score), factors };
}

/**
 * Safe Bangla copy used when Gemini is disabled or unavailable. It deliberately
 * combines evidence, uncertainty, and a human-review instruction, matching the
 * cautious operational tone required for field alerts.
 */
function buildBanglaFallback({ pattern, agentId, entityId, metrics, transactions }) {
  const count = Number(metrics.count || transactions.length || 0);
  const minutes = Number(durationMinutes(transactions).toFixed(2));
  const amount = Number(metrics.amount || 0);
  const totalAmount = Number(metrics.totalAmount || amount || 0);
  const provider = metrics.provider
    || (Array.isArray(metrics.providers) ? metrics.providers.join(', ') : '')
    || 'সংশ্লিষ্ট প্রোভাইডার';
  const transactionTypes = Array.isArray(metrics.transactionTypes) ? metrics.transactionTypes : [];
  const transactionLabelBn = transactionTypes.length === 1
    ? ({ 'cash-out': 'ক্যাশ-আউট', 'cash-in': 'ক্যাশ-ইন' }[transactionTypes[0]] || 'লেনদেন')
    : 'লেনদেন';
  let evidenceBn;

  switch (pattern) {
    case 'clone_pattern':
      evidenceBn = `গত ${minutes} মিনিটে এজেন্ট ${agentId}-এ একই ${formatAmount(amount)} পরিমাণের ${count}টি ${transactionLabelBn} হয়েছে।`;
      break;
    case 'smurfing_pattern':
      evidenceBn = `গত ${minutes} মিনিটে ব্যবহারকারী ${entityId} মোট ${formatAmount(totalAmount)}-এর ${count}টি ${transactionLabelBn} করেছেন।`;
      break;
    case 'unusual_velocity':
      evidenceBn = `গত ${minutes} মিনিটে ব্যবহারকারী ${entityId} ${provider}-এর মাধ্যমে ${count}টি লেনদেন করেছেন, যা স্বাভাবিকের তুলনায় বেশি দ্রুত।`;
      break;
    case 'time_anomaly':
      evidenceBn = `অস্বাভাবিক সময়ে এজেন্ট ${agentId}-এ ${formatAmount(amount)} পরিমাণের একটি উচ্চ-মূল্যের লেনদেন হয়েছে।`;
      break;
    case 'balance_inconsistency':
      evidenceBn = `জরুরি তারল্য-সহায়তার অনুরোধের সঙ্গে ${provider}-এর রেকর্ডকৃত ${formatAmount(metrics.balance || 0)} ব্যালেন্সের অসামঞ্জস্য দেখা গেছে।`;
      break;
    case 'abnormal_failure_rate':
      evidenceBn = `গত ${minutes} মিনিটে এজেন্ট ${agentId}-এ ধারাবাহিকভাবে ${count}টি লেনদেনের চেষ্টা ব্যর্থ হয়েছে।`;
      break;
    case 'area_velocity_surge':
      evidenceBn = `${entityId} এলাকায় গত ${minutes} মিনিটে ${count}টি লেনদেন হয়েছে, যা স্বাভাবিকের চেয়ে অনেক বেশি।`;
      break;
    case 'area_coordinated_pattern':
      evidenceBn = `${entityId} এলাকায় ${count}টি এজেন্টে একই ধরনের অস্বাভাবিক কার্যক্রম একই সময়ে শনাক্ত হয়েছে।`;
      break;
    case 'regional_cascade':
      evidenceBn = `${entityId} অঞ্চলে ${count}টি এলাকায় একই সময়ে অস্বাভাবিক কার্যক্রম শনাক্ত হয়েছে।`;
      break;
    default:
      evidenceBn = `এজেন্ট ${agentId}-এর সাম্প্রতিক লেনদেনে অস্বাভাবিক কার্যক্রমের একটি ধরণ শনাক্ত হয়েছে।`;
  }

  return `${evidenceBn} এটি স্বাভাবিক গ্রাহক চাহিদা বা ডেটার সমস্যার কারণেও হতে পারে; তবে কোনো সিদ্ধান্ত নেওয়ার আগে একজন দায়িত্বপ্রাপ্ত কর্মীকে তথ্যগুলো পর্যালোচনা করতে হবে।`;
}

/** English fallback carrying the same three ideas as the Bangla paragraph. */
function buildEnglishFallback(evidence) {
  return `${evidence} This may reflect normal customer demand or a data issue. A responsible person must review the information before any action is taken.`;
}

/** Natural Banglish fallback for teams that communicate Bangla in Latin text. */
function buildBanglishFallback({ pattern, agentId, entityId, metrics, transactions }) {
  const count = Number(metrics.count || transactions.length || 0);
  const minutes = Number(durationMinutes(transactions).toFixed(2));
  const amount = Number(metrics.amount || 0);
  const totalAmount = Number(metrics.totalAmount || amount || 0);
  const provider = metrics.provider
    || (Array.isArray(metrics.providers) ? metrics.providers.join(', ') : '')
    || 'songslishto provider';
  const transactionTypes = Array.isArray(metrics.transactionTypes) ? metrics.transactionTypes : [];
  const transactionLabel = transactionTypes.length === 1
    ? ({ 'cash-out': 'cash-out', 'cash-in': 'cash-in' }[transactionTypes[0]] || 'transaction')
    : 'transaction';
  let evidenceBanglish;

  switch (pattern) {
    case 'clone_pattern':
      evidenceBanglish = `Goto ${minutes} minute-e agent ${agentId}-e eki ${formatAmount(amount)} porimaner ${count}ti ${transactionLabel} hoyeche.`;
      break;
    case 'smurfing_pattern':
      evidenceBanglish = `Goto ${minutes} minute-e user ${entityId} mot ${formatAmount(totalAmount)}-er ${count}ti ${transactionLabel} korechen.`;
      break;
    case 'unusual_velocity':
      evidenceBanglish = `Goto ${minutes} minute-e user ${entityId} ${provider}-er maddhome ${count}ti transaction korechen, ja shabhabiker cheye beshi druto.`;
      break;
    case 'time_anomaly':
      evidenceBanglish = `Oshabhabik shomoye agent ${agentId}-e ${formatAmount(amount)} porimaner ekti high-value transaction hoyeche.`;
      break;
    case 'balance_inconsistency':
      evidenceBanglish = `Joruri liquidity support request-er sathe ${provider}-er recorded ${formatAmount(metrics.balance || 0)} balance-er omil dekha geche.`;
      break;
    case 'abnormal_failure_rate':
      evidenceBanglish = `Goto ${minutes} minute-e agent ${agentId}-e porpor ${count}ti transaction attempt fail koreche.`;
      break;
    case 'area_velocity_surge':
      evidenceBanglish = `${entityId} elakay goto ${minutes} minute-e ${count}ti transaction hoyeche, ja shabhabiker cheye onek beshi.`;
      break;
    case 'area_coordinated_pattern':
      evidenceBanglish = `${entityId} elakay ${count}ti agent-e eki dhoroner unusual activity eki shomoy-e detect hoyeche.`;
      break;
    case 'regional_cascade':
      evidenceBanglish = `${entityId} onchole ${count}ti elakay eki shomoy-e unusual activity detect hoyeche.`;
      break;
    default:
      evidenceBanglish = `Agent ${agentId}-er shamprotik transaction-e unusual activity-r ekti pattern detect hoyeche.`;
  }

  return `${evidenceBanglish} Eti shabhabik customer demand ba data problem-er karoneo hote pare; tobe kono decision neyar age ekjon dayittoprapto person-ke information review korte hobe.`;
}

/**
 * Build the shared alert object returned by every detector.
 * The hash makes the alert ID stable for the same rule/evidence/timestamp,
 * which helps clients avoid rendering the same alert twice.
 */
function createAlert({
  pattern,
  agent,
  entityType = 'agent',
  entityId,
  transactions = [],
  metrics = {},
  evidence,
  context,
  recommendedAction,
  detectedAt,
  extra = {},
}) {
  const agentId = getAgentId(agent);
  const sortedTransactions = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const transactionIds = sortedTransactions.map((transaction) => transaction.id);
  const identity = [pattern, agentId, entityId, ...transactionIds, detectedAt].join('|');
  const hash = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12).toUpperCase();
  const severity = calculateSeverity(pattern, metrics);
  // These message fields are also the deterministic fallback if Gemini fails.
  const subject = `Unusual Activity Requiring Review (${entityId || agentId})`;
  const messageBn = buildBanglaFallback({
    pattern,
    agentId,
    entityId: String(entityId || agentId),
    metrics,
    transactions: sortedTransactions,
  });
  const messageEn = buildEnglishFallback(evidence);
  const messageBanglish = buildBanglishFallback({
    pattern,
    agentId,
    entityId: String(entityId || agentId),
    metrics,
    transactions: sortedTransactions,
  });

  return {
    alert_id: `ALT-${hash}`,
    alert_type: 'unusual_activity',
    pattern,
    pattern_name: PATTERN_NAMES[pattern],
    agent_id: agentId,
    entity_type: entityType,
    entity_id: String(entityId || agentId),
    detected_at: new Date(detectedAt).toISOString(),
    window: sortedTransactions.length
      ? {
          start: sortedTransactions[0].time,
          end: sortedTransactions[sortedTransactions.length - 1].time,
          duration_minutes: Number(durationMinutes(sortedTransactions).toFixed(2)),
        }
      : null,
    severity,
    transaction_ids: transactionIds,
    metrics,
    ...extra,
    subject,
    evidence,
    message_en: messageEn,
    message_bn: messageBn,
    message_banglish: messageBanglish,
    context: context || 'This may reflect normal customer demand, a data issue, or activity that requires review.',
    recommended_action: recommendedAction || 'Have a field worker complete a human review of the transaction logs with the agent before taking action.',
    safe_language_note: 'This alert indicates unusual activity and requires human review; it is not an automated conclusion.',
    message_source: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Dashboard alert formatting and delivery routing
// ---------------------------------------------------------------------------

/** Choose one readable provider label for the compact anomaly alert. */
function anomalityAlertProvider(alert) {
  if (alert.metrics?.provider) return String(alert.metrics.provider);
  const providers = Array.isArray(alert.metrics?.providers) ? alert.metrics.providers : [];
  if (providers.length === 1) return String(providers[0]);
  if (providers.length > 1) return 'MULTIPLE_PROVIDERS';
  return 'ALL_PROVIDERS';
}

/**
 * Convert the detailed internal alert into the compact `anomality_alert` shape.
 * This is intentionally separate from the existing `active_alerts` liquidity
 * queue; neither system overwrites or mixes with the other.
 *
 * Delivery rule:
 * - a user alert is shown to the agent who handled the transactions;
 * - an agent alert is shown to the territory manager for the agent's area.
 */
function formatAnomalityAlert(alert, agent = {}, manager = {}) {
  const agentId = alert.agent_id || getAgentId(agent);
  const businessName = getBusinessName(agent);
  const areaName = getAreaName(agent);
  const managerArea = firstDefined(manager.managed_region, manager.area_name, areaName);
  const isUserAlert = alert.entity_type === 'user';
  const recipientType = isUserAlert ? 'agent' : 'manager';
  const managerTarget = firstDefined(
    manager.manager_id,
    manager.managerId,
    agent.manager_id,
    agent.managerId,
    `ALL_PROVIDERS_TERRITORY_OPS_${routingToken(areaName) || 'UNASSIGNED'}`,
  );
  const routingTarget = isUserAlert ? agentId : managerTarget;
  const provider = anomalityAlertProvider(alert);
  const dedupDimension = firstDefined(
    alert.metrics?.provider,
    alert.metrics?.amount,
    alert.pattern === 'time_anomaly' ? alert.transaction_ids?.[0] : null,
    alert.entity_id,
    provider,
  );

  return {
    alert_id: alert.alert_id,
    dedup_key: [agentId, String(alert.pattern).toUpperCase(), alert.entity_id, dedupDimension]
      .map((part) => String(part))
      .join(':'),
    timestamp: alert.detected_at,
    alert_type: String(alert.pattern).toUpperCase(),
    severity: String(alert.severity.level).toUpperCase(),
    severity_score: alert.severity.score,
    provider,
    agent_id: agentId,
    business_name: businessName,
    ...(isUserAlert ? { user_id: alert.entity_id } : {}),
    subject_entity_type: alert.entity_type,
    subject_entity_id: alert.entity_id,
    title: alert.subject,
    message_en: alert.message_en,
    message_bn: alert.message_bn,
    message_banglish: alert.message_banglish,
    context: alert.context,
    evidence: alert.evidence,
    uncertainty: 'Data Confidence: HIGH',
    recommended_action: alert.recommended_action,
    workflow_status: isUserAlert ? 'NEW_AGENT_REVIEW' : 'NEW_UNASSIGNED',
    can_forward: true,
    recipient_type: recipientType,
    routing_target: routingTarget,
    responsible_role: isUserAlert
      ? `Agent (${businessName})`
      : `Territory Manager (${managerArea})`,
    transaction_ids: alert.transaction_ids,
  };
}

/**
 * Put each anomaly array directly on its owning entity. This deliberately does
 * not create a top-level queue or inbox abstraction.
 */
function attachAnomalityAlertsToEntities(result, agent = {}, manager = {}) {
  const anomalityAlerts = result.alerts.map((alert) => formatAnomalityAlert(alert, agent, manager));
  const agentId = getAgentId(agent);
  const areaName = getAreaName(agent);
  const managerArea = firstDefined(manager.managed_region, manager.area_name, areaName);
  const managerTarget = firstDefined(
    manager.manager_id,
    manager.managerId,
    agent.manager_id,
    agent.managerId,
    `ALL_PROVIDERS_TERRITORY_OPS_${routingToken(areaName) || 'UNASSIGNED'}`,
  );

  return {
    ...result,
    agent: {
      ...agent,
      agent_id: agentId,
      business_name: getBusinessName(agent),
      area_name: areaName,
      anomality_alert: anomalityAlerts.filter((alert) => alert.recipient_type === 'agent'),
    },
    manager: {
      ...manager,
      manager_id: managerTarget,
      managed_region: managerArea,
      anomality_alert: anomalityAlerts.filter((alert) => alert.recipient_type === 'manager'),
    },
  };
}

// ---------------------------------------------------------------------------
// Transaction anomaly rules
// ---------------------------------------------------------------------------

/**
 * Clone Pattern
 * Trigger: at least 5 successful transactions with exactly the same amount
 * inside a period strictly shorter than 10 minutes.
 *
 * This is agent-level because it describes a counter-wide pattern. When
 * `user_id` phone numbers are available, distinctUsers shows how many customer
 * accounts participated in the repeated-amount burst.
 */
function findCloneAlerts(transactions, agent, config, detectedAt) {
  const eligible = transactions.filter((transaction) => transaction.successful && transaction.amount !== null);
  const groups = groupBy(eligible, (transaction) => String(transaction.amount));
  const alerts = [];

  for (const group of groups.values()) {
    const window = densestWindow(group, config.cloneWindowMinutes);
    if (window.length < config.cloneMinimumCount) continue;

    const amount = window[0].amount;
    const types = [...new Set(window.map((transaction) => transaction.type))];
    const type = types.length === 1 ? types[0] : 'transaction';
    const providers = providerNames(window);
    const users = new Set(window.map((transaction) => transaction.userId).filter(Boolean));
    const minutes = Number(durationMinutes(window).toFixed(2));
    const totalAmount = amount * window.length;

    alerts.push(createAlert({
      pattern: 'clone_pattern',
      agent,
      transactions: window,
      metrics: {
        count: window.length,
        threshold: config.cloneMinimumCount,
        amount,
        totalAmount,
        distinctUsers: users.size || null,
        providerCount: providers.length,
        providers,
        transactionTypes: types,
        ruleWindowMinutes: config.cloneWindowMinutes,
        veryRapid: minutes <= config.cloneWindowMinutes / 2,
      },
      evidence: `Agent ${getAgentId(agent)} processed ${window.length} ${describeType(type, window.length)} of exactly ${formatAmount(amount)} across ${providers.join(', ')} in ${minutes} minutes.`,
      recommendedAction: 'Have a field worker complete a human review of these transactions with the agent before supplying additional liquidity or taking any account action.',
      detectedAt,
    }));
  }

  return alerts;
}

/**
 * Transaction Splitting (Smurfing Pattern)
 * Trigger: at least 4 successful transactions belonging to the same `user_id`
 * phone number inside a period strictly shorter than 5 minutes.
 */
function findSmurfingAlerts(transactions, agent, config, detectedAt) {
  const eligible = transactions.filter((transaction) => (
    transaction.successful && transaction.userId && transaction.amount !== null
  ));
  const groups = groupBy(eligible, (transaction) => String(transaction.userId));
  const alerts = [];

  for (const group of groups.values()) {
    const window = densestWindow(group, config.smurfingWindowMinutes);
    if (window.length < config.smurfingMinimumCount) continue;

    const userId = window[0].userId;
    const types = [...new Set(window.map((transaction) => transaction.type))];
    const type = types.length === 1 ? types[0] : 'transaction';
    const providers = providerNames(window);
    const totalAmount = window.reduce((sum, transaction) => sum + transaction.amount, 0);
    const minutes = Number(durationMinutes(window).toFixed(2));

    alerts.push(createAlert({
      pattern: 'smurfing_pattern',
      agent,
      entityType: 'user',
      entityId: userId,
      transactions: window,
      metrics: {
        count: window.length,
        threshold: config.smurfingMinimumCount,
        totalAmount,
        providerCount: providers.length,
        providers,
        transactionTypes: types,
        ruleWindowMinutes: config.smurfingWindowMinutes,
        veryRapid: minutes <= config.smurfingWindowMinutes / 2,
      },
      evidence: `User ${userId} completed ${window.length} ${describeType(type, window.length)} totaling ${formatAmount(totalAmount)} in ${minutes} minutes at agent ${getAgentId(agent)}.`,
      recommendedAction: 'Have a field worker complete a human review of the sequence and confirm its purpose with the agent and customer.',
      detectedAt,
    }));
  }

  return alerts;
}

/**
 * Unusual Transaction Velocity
 * Trigger: one `user_id` phone number performs at least 8 successful
 * transactions in the outer 15-minute window, regardless of amount or type.
 */
function findVelocityAlerts(transactions, agent, config, detectedAt) {
  const eligible = transactions.filter((transaction) => transaction.successful && transaction.userId);
  const groups = groupBy(eligible, (transaction) => String(transaction.userId));
  const alerts = [];

  for (const group of groups.values()) {
    const window = densestWindow(group, config.velocityWindowMinutes);
    if (window.length < config.velocityMinimumCount) continue;

    const providers = providerNames(window);
    const types = [...new Set(window.map((transaction) => transaction.type))];
    const totalAmount = window.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
    const minutes = Number(durationMinutes(window).toFixed(2));

    alerts.push(createAlert({
      pattern: 'unusual_velocity',
      agent,
      entityType: 'user',
      entityId: window[0].userId,
      transactions: window,
      metrics: {
        count: window.length,
        threshold: config.velocityMinimumCount,
        totalAmount,
        providerCount: providers.length,
        providers,
        transactionTypes: types,
        ruleWindowMinutes: config.velocityWindowMinutes,
        veryRapid: minutes <= config.velocityWindowMinutes / 2,
      },
      evidence: `User ${window[0].userId} completed ${window.length} transactions across ${providers.join(', ')} in ${minutes} minutes at agent ${getAgentId(agent)}.`,
      recommendedAction: 'Have a field worker complete a human review of the customer activity and cross-provider sequence with the agent.',
      detectedAt,
    }));
  }

  return alerts;
}

// Convert UTC timestamps into the configured local shop time without changing
// the server's or operating system's timezone.
function localHour(timestamp, timezoneOffsetMinutes) {
  const shifted = new Date(timestamp + timezoneOffsetMinutes * MINUTE_MS);
  return shifted.getUTCHours();
}

function localTimeLabel(timestamp, timezoneOffsetMinutes) {
  const shifted = new Date(timestamp + timezoneOffsetMinutes * MINUTE_MS);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

function isOddHour(hour, start, end) {
  // The first expression handles ranges crossing midnight, such as 23:00-06:00.
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * Time Anomaly
 * Trigger: a successful transaction at or above highValueAmount occurs during
 * configured closed/odd hours. Bangladesh defaults are 23:00 through 05:59.
 */
function findTimeAnomalyAlerts(transactions, agent, config, detectedAt) {
  return transactions
    .filter((transaction) => (
      transaction.successful
      && transaction.amount !== null
      && transaction.amount >= config.highValueAmount
      && isOddHour(
        localHour(transaction.timestamp, config.timezoneOffsetMinutes),
        config.oddHourStart,
        config.oddHourEnd,
      )
    ))
    .map((transaction) => {
      const hour = localHour(transaction.timestamp, config.timezoneOffsetMinutes);
      return createAlert({
        pattern: 'time_anomaly',
        agent,
        entityType: transaction.userId ? 'user' : 'agent',
        entityId: transaction.userId || getAgentId(agent),
        transactions: [transaction],
        metrics: {
          count: 1,
          threshold: 1,
          amount: transaction.amount,
          totalAmount: transaction.amount,
          providerCount: 1,
          providers: [transaction.provider],
          localHour: hour,
          timezoneOffsetMinutes: config.timezoneOffsetMinutes,
        },
        evidence: `Agent ${getAgentId(agent)} processed a high-value ${transaction.type} of ${formatAmount(transaction.amount)} through ${transaction.provider} at ${localTimeLabel(transaction.timestamp, config.timezoneOffsetMinutes)} local time.`,
        recommendedAction: 'Have a field worker complete a human review of this transaction and confirm the shop was operating with the agent.',
        detectedAt,
      });
    });
}

// ---------------------------------------------------------------------------
// Agent operational anomaly rules
// ---------------------------------------------------------------------------

/** Read provider e-money balances from either supported agent JSON shape. */
function providerBalances(agent = {}) {
  return firstDefined(
    agent.balances?.provider_e_money,
    agent.current_balances?.provider_e_money,
    agent.provider_e_money,
    {},
  );
}

/** Accept requests sent directly to the API or nested under common agent keys. */
function supportRequests(agent, explicitRequests) {
  if (Array.isArray(explicitRequests)) return explicitRequests;
  for (const candidate of [agent.support_requests, agent.support_tickets, agent.tickets]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/**
 * Balance Inconsistency
 * Trigger: an open/urgent support request claims a liquidity shortage while
 * the recorded provider e-money is still at or above highBalanceAmount.
 */
function findBalanceInconsistencyAlerts(agent, explicitRequests, config, detectedAt) {
  const balances = providerBalances(agent);
  const requests = supportRequests(agent, explicitRequests);
  const alerts = [];

  for (const request of requests) {
    const status = String(firstDefined(request.status, 'open')).toLowerCase();
    if (['closed', 'resolved', 'cancelled', 'canceled'].includes(status)) continue;

    const text = [request.reason, request.message, request.description, request.subject, request.type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const urgency = String(firstDefined(request.urgency, request.priority, '')).toLowerCase();
    // Free-text support systems may express the same shortage in several ways.
    const claimsShortage = /(out|empty|shortage|insufficient|no\s+e-?money|liquidity)/i.test(text);
    if (!claimsShortage && !['urgent', 'critical', 'high'].includes(urgency)) continue;

    const requestedProvider = firstDefined(request.provider_id, request.provider);
    // If no provider was specified, inspect the largest balance first.
    const matchingProvider = Object.keys(balances)
      .filter((provider) => (
        !requestedProvider || provider.toLowerCase() === String(requestedProvider).toLowerCase()
      ))
      .sort((first, second) => Number(balances[second]) - Number(balances[first]))
      .find((provider) => Number(balances[provider]) >= config.highBalanceAmount);
    if (!matchingProvider) continue;

    const balance = Number(balances[matchingProvider]);
    if (!Number.isFinite(balance) || balance < config.highBalanceAmount) continue;

    const requestId = String(firstDefined(request.ticket_id, request.request_id, request.id, 'support-request'));
    alerts.push(createAlert({
      pattern: 'balance_inconsistency',
      agent,
      entityId: getAgentId(agent),
      metrics: {
        count: 1,
        threshold: 1,
        balance,
        provider: matchingProvider,
        highBalanceThreshold: config.highBalanceAmount,
        requestId,
      },
      evidence: `Support request ${requestId} reports an urgent liquidity shortage for ${matchingProvider}, while the recorded e-money balance is ${formatAmount(balance)}.`,
      context: 'This may be a synchronization issue, a misunderstood request, or an operational situation that requires review.',
      recommendedAction: 'Have a field worker complete a human review by comparing the live balance with the support request and contacting the agent before supplying additional e-money.',
      detectedAt,
      extra: { support_request_id: requestId },
    }));
  }

  return alerts;
}

/**
 * Abnormal Failure Rate
 * Trigger: at least 20 consecutive failed attempts within 15 minutes. A single
 * successful/non-failed transaction ends a run, so unrelated failures are not
 * combined into one alert.
 */
function findFailureAlerts(transactions, agent, config, detectedAt) {
  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const runs = [];
  let run = [];

  // Split the timeline into uninterrupted runs of failed transactions.
  for (const transaction of sorted) {
    if (transaction.failed) {
      run.push(transaction);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  const alerts = [];
  for (const failureRun of runs) {
    const window = densestWindow(failureRun, config.failureWindowMinutes);
    if (window.length < config.failureMinimumCount) continue;

    const providers = providerNames(window);
    const minutes = Number(durationMinutes(window).toFixed(2));
    alerts.push(createAlert({
      pattern: 'abnormal_failure_rate',
      agent,
      transactions: window,
      metrics: {
        count: window.length,
        threshold: config.failureMinimumCount,
        consecutiveCount: window.length,
        providerCount: providers.length,
        providers,
        ruleWindowMinutes: config.failureWindowMinutes,
        veryRapid: minutes <= config.failureWindowMinutes / 2,
      },
      evidence: `Agent ${getAgentId(agent)} recorded ${window.length} consecutive failed transaction attempts across ${providers.join(', ')} in ${minutes} minutes.`,
      context: 'This may indicate a service problem, repeated customer errors, or account activity that requires review.',
      recommendedAction: 'Have a field worker complete a human review of failure codes, provider service status, and the agent context before retrying or escalating.',
      detectedAt,
    }));
  }

  return alerts;
}

/** Merge numeric, non-negative caller overrides with safe defaults. */
function buildConfig(overrides = {}) {
  const config = { ...DEFAULT_CONFIG };
  for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
    if (overrides[key] === undefined) continue;
    const value = Number(overrides[key]);
    if (Number.isFinite(value) && value >= 0) config[key] = value;
    else config[key] = defaultValue;
  }
  return config;
}

// ---------------------------------------------------------------------------
// Deterministic analysis orchestration
// ---------------------------------------------------------------------------

/**
 * Pure anomaly detector. It accepts either agent.recent_transactions or an
 * explicit transactions array. By default the newest transaction is the end
 * of the 15-minute analysis window, which also makes historical replay safe.
 */
function detectAnomalies({
  agent = {},
  manager = {},
  transactions,
  supportRequests: requests,
  now,
  config: overrides,
} = {}) {
  const config = buildConfig(overrides);
  const agentId = getAgentId(agent);
  const rawTransactions = Array.isArray(transactions)
    ? transactions
    : (Array.isArray(agent.recent_transactions) ? agent.recent_transactions : []);
  const normalized = rawTransactions
    .map((transaction, index) => normalizeTransaction(transaction, index, agentId))
    // Bad timestamps cannot participate in any time-window rule safely.
    .filter((transaction) => transaction.timestamp !== null);
  const explicitNow = toTimestamp(now);
  // Using the newest transaction when `now` is omitted supports data replay:
  // historical test data is analyzed relative to itself, not today's clock.
  const latestTimestamp = normalized.length
    ? Math.max(...normalized.map((transaction) => transaction.timestamp))
    : Date.now();
  const detectedAt = explicitNow ?? latestTimestamp;
  const lowerBound = detectedAt - config.analysisWindowMinutes * MINUTE_MS;
  const analysisTransactions = normalized.filter((transaction) => (
    transaction.timestamp <= detectedAt && transaction.timestamp >= lowerBound
  ));

  // Rules run independently. One transaction sequence can correctly create
  // more than one alert (for example splitting plus unusual velocity).
  const alerts = [
    ...findCloneAlerts(analysisTransactions, agent, config, detectedAt),
    ...findSmurfingAlerts(analysisTransactions, agent, config, detectedAt),
    ...findVelocityAlerts(analysisTransactions, agent, config, detectedAt),
    ...findTimeAnomalyAlerts(analysisTransactions, agent, config, detectedAt),
    ...findBalanceInconsistencyAlerts(agent, requests, config, detectedAt),
    ...findFailureAlerts(analysisTransactions, agent, config, detectedAt),
  ];

  // Highest-priority alerts appear first for field-worker dashboards.
  alerts.sort((first, second) => (
    second.severity.score - first.severity.score
    || second.detected_at.localeCompare(first.detected_at)
  ));

  return attachAnomalityAlertsToEntities({
    agent_id: agentId,
    analyzed_at: new Date(detectedAt).toISOString(),
    analysis_window_minutes: config.analysisWindowMinutes,
    transactions_received: rawTransactions.length,
    transactions_analyzed: analysisTransactions.length,
    alert_count: alerts.length,
    alerts,
  }, agent, manager);
}

// ---------------------------------------------------------------------------
// Optional Gemini message generation
// ---------------------------------------------------------------------------

// Gemini receives already-detected evidence and may only rewrite display text.
// The prompt prohibits accusatory language and requires human review.
const GEMINI_SYSTEM_PROMPT = `You are an AI assistant for a Super Agent Risk Intelligence Platform. Generate a short bilingual alert from the supplied deterministic alert evidence.

Rules:
- Never use the words "fraud", "illegal", or "crime", or the Bangla accusation terms "প্রতারণা", "অবৈধ", or "অপরাধ".
- Use careful language such as "unusual activity" or "requires review".
- State only the supplied evidence; do not invent facts or accusations.
- Do not calculate, predict, modify, or control liquidity, balances, refills, or shortage timing. If liquidity is mentioned in the supplied evidence, treat it only as context.
- Include possible normal or data-quality explanations in Context.
- Recommended Action must explicitly require human review.
- Subject, Evidence, Context, and Recommended Action must be concise English.
- message_en must be a natural English paragraph of 2-3 short sentences for a field worker.
- message_bn must be a natural Bangla paragraph of 2-3 short sentences for a field worker.
- message_banglish must express Bangla naturally using only Latin characters in 2-3 short sentences.
- message_en, message_bn, and message_banglish must communicate the same facts and guidance: concrete available evidence, the possibility of normal demand or a data issue, and review by a responsible person before action.
- Do not add headings, Markdown, or bullet points inside any message field.
- Return only the requested structured JSON fields.`;

/** Reject words that violate the platform's safe-language requirements. */
function hasUnsafeLanguage(message) {
  const text = Object.values(message).join(' ');
  return /\b(fraud|illegal|crime)\b/i.test(text) || /(প্রতারণা|অবৈধ|অপরাধ)/u.test(text);
}

/**
 * Treat model output as untrusted input. All required fields must be present,
 * safe, and explicitly direct a person to review the evidence.
 */
function validateGeminiMessage(value) {
  const fields = [
    'subject',
    'evidence',
    'context',
    'recommended_action',
    'message_en',
    'message_bn',
    'message_banglish',
  ];
  if (!value || typeof value !== 'object') return null;
  const message = {};

  for (const field of fields) {
    if (typeof value[field] !== 'string' || !value[field].trim()) return null;
    message[field] = value[field].trim();
  }

  const hasBanglaText = /[\u0980-\u09FF]/u.test(message.message_bn);
  const banglaRequiresReview = /(পর্যালোচনা|যাচাই)/u.test(message.message_bn);
  const englishRequiresReview = /review/i.test(message.message_en);
  const banglishUsesLatinText = /[a-z]/i.test(message.message_banglish)
    && !/[\u0980-\u09FF]/u.test(message.message_banglish);
  const banglishRequiresReview = /(review|porjalochona|jachai)/i.test(message.message_banglish);
  if (
    hasUnsafeLanguage(message)
    || !/human|field worker|person|manual/i.test(message.recommended_action)
    || !hasBanglaText
    || !banglaRequiresReview
    || !englishRequiresReview
    || !banglishUsesLatinText
    || !banglishRequiresReview
  ) {
    return null;
  }
  return message;
}

/**
 * Request one structured alert message from Gemini's generateContent endpoint.
 * AbortController prevents an external API delay from hanging the alert route.
 */
async function generateGeminiMessage(alert, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A Fetch API implementation is required');

  const model = options.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const timeoutMs = Number(options.timeoutMs || process.env.GEMINI_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  // Send only the evidence Gemini needs to write the message. The deterministic
  // severity is context, not something the model is allowed to recalculate.
  const promptData = {
    alert_triggered: alert.pattern_name,
    agent_id: alert.agent_id,
    entity_type: alert.entity_type,
    entity_id: alert.entity_id,
    deterministic_severity: alert.severity,
    evidence: alert.evidence,
    context: alert.context,
    required_next_step: alert.recommended_action,
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(promptData) }] }],
        generationConfig: {
          // Low temperature keeps operational wording consistent across calls.
          temperature: 0.2,
          // JSON schema makes parsing predictable, but validation is still required.
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              subject: { type: 'string' },
              evidence: { type: 'string' },
              context: { type: 'string' },
              recommended_action: { type: 'string' },
              message_en: {
                type: 'string',
                description: 'A natural 2-3 sentence English alert containing evidence, uncertainty, and a human-review instruction.',
              },
              message_bn: {
                type: 'string',
                description: 'A natural 2-3 sentence Bangla alert containing evidence, uncertainty, and a human-review instruction.',
              },
              message_banglish: {
                type: 'string',
                description: 'The same alert in natural Banglish using Latin characters, including evidence, uncertainty, and a human-review instruction.',
              },
            },
            required: [
              'subject',
              'evidence',
              'context',
              'recommended_action',
              'message_en',
              'message_bn',
              'message_banglish',
            ],
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    // A candidate can contain multiple text parts, so join all returned parts.
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) throw new Error('Gemini returned no alert message');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw new Error('Gemini returned invalid JSON');
    }

    const message = validateGeminiMessage(parsed);
    if (!message) throw new Error('Gemini returned an unsafe or incomplete alert message');
    return message;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main orchestration function requested by the alert API. Detection and
 * severity always run locally; safe deterministic copy is retained whenever
 * Gemini is disabled, unavailable, or returns invalid content.
 */
async function anomalityAlert(input = {}, options = {}) {
  // Detection always runs first and always produces complete fallback messages.
  const result = detectAnomalies(input);
  const useGemini = options.useGemini !== false && input.useGemini !== false;
  const hasApiKey = Boolean(options.apiKey || process.env.GEMINI_API_KEY);

  if (!useGemini || !hasApiKey || result.alerts.length === 0) {
    return result;
  }

  // Enrich alerts one at a time to avoid an uncontrolled burst of API requests.
  const alerts = [];
  for (const alert of result.alerts) {
    try {
      const message = await generateGeminiMessage(alert, options);
      alerts.push({ ...alert, ...message, message_source: 'gemini' });
    } catch (error) {
      // Never fail the entire analysis because message generation failed.
      alerts.push({
        ...alert,
        message_source: 'deterministic_fallback',
        message_generation_note: error.name === 'AbortError'
          ? 'Gemini timed out; deterministic wording was used.'
          : 'Gemini was unavailable or returned invalid wording; deterministic wording was used.',
      });
    }
  }

  // Rebuild dashboard views so Gemini wording, when valid, appears there too.
  return attachAnomalityAlertsToEntities(
    { ...result, alerts },
    input.agent || {},
    input.manager || {},
  );
}

// Export pure functions separately so rule/severity behavior is easy to test.
module.exports = {
  DEFAULT_CONFIG,
  PATTERN_NAMES,
  BASE_SEVERITY,
  GEMINI_SYSTEM_PROMPT,
  anomalityAlert,
  generateAnomalityAlerts: anomalityAlert,
  detectAnomalies,
  calculateSeverity,
  formatAnomalityAlert,
  attachAnomalityAlertsToEntities,
  generateGeminiMessage,
};
