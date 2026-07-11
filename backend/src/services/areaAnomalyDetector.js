const crypto = require('crypto');
const {
  PATTERN_NAMES,
  BASE_SEVERITY,
  DEFAULT_CONFIG,
  calculateSeverity,
  detectAnomalies,
} = require('./anomalityAlert');

/**
 * Area & Regional Anomaly Detector
 * ---------------------------------
 * Detects anomalies that span multiple agents in the same area or region.
 *
 * Processing flow:
 * 1. Group all agents by area_name.
 * 2. For each area, pool transactions and run area-level rules.
 * 3. Group areas by managed_region (derived from managers).
 * 4. For each region, check if multiple areas triggered area alerts (cascade).
 * 5. Build alert objects with manager routing.
 *
 * Important: These rules supplement per-agent detection. They never replace or
 * override existing per-agent alerts.
 */

const MINUTE_MS = 60 * 1000;

// Default thresholds for area/regional rules.
const AREA_CONFIG = Object.freeze({
  // Area velocity surge: total transactions across all agents in the area.
  areaVelocityWindowMinutes: 15,
  areaVelocityMinimumCount: 30,
  // Area coordinated pattern: minimum agents sharing the same anomaly pattern.
  coordinatedMinimumAgents: 3,
  // Regional cascade: minimum areas with area-level alerts in the same region.
  cascadeMinimumAreas: 2,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== '');
}

function getAgentId(agent = {}) {
  return firstDefined(agent.agent_id, agent.agentId, agent.agent_profile?.agent_id, 'unknown-agent');
}

function getAreaName(agent = {}) {
  return firstDefined(agent.area_name, agent.areaName, agent.agent_profile?.area_name, 'Unassigned area');
}

function routingToken(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function severityLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function formatAmount(amount) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} BDT`;
}

/**
 * Build the area for each agent using its manager linkage.
 * Returns a Map: area_name -> { agents, managerIds }
 */
function groupAgentsByArea(agents) {
  const areas = new Map();
  for (const agent of agents) {
    const area = getAreaName(agent);
    if (!areas.has(area)) {
      areas.set(area, { agents: [], managerIds: new Set() });
    }
    const group = areas.get(area);
    group.agents.push(agent);
    if (agent.manager_id) group.managerIds.add(agent.manager_id);
  }
  return areas;
}

/**
 * Build a region map from managers.
 * Returns a Map: managed_region -> Set<manager_id>
 */
function groupManagersByRegion(managers) {
  const regions = new Map();
  for (const manager of managers) {
    const region = firstDefined(manager.managed_region, 'Unassigned region');
    if (!regions.has(region)) regions.set(region, new Set());
    regions.get(region).add(manager.manager_id);
  }
  return regions;
}

/**
 * Find which region an area belongs to by looking at manager assignments.
 * An area can span multiple regions if its agents have managers in different regions.
 */
function findRegionsForArea(areaManagerIds, managers) {
  const regions = new Set();
  for (const managerId of areaManagerIds) {
    const manager = managers.find((m) => m.manager_id === managerId);
    if (manager) {
      regions.add(firstDefined(manager.managed_region, 'Unassigned region'));
    }
  }
  return regions;
}

// ---------------------------------------------------------------------------
// Alert construction
// ---------------------------------------------------------------------------

function createAreaAlert({
  pattern,
  areaName,
  agents,
  metrics,
  evidence,
  context,
  recommendedAction,
  detectedAt,
  managerIds,
}) {
  const agentIds = agents.map((a) => getAgentId(a));
  const identity = [pattern, areaName, ...agentIds, detectedAt].join('|');
  const hash = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12).toUpperCase();
  const severity = calculateSeverity(pattern, metrics);

  const subject = `Area-Level Unusual Activity: ${areaName}`;

  // Bangla fallback
  let messageBn;
  switch (pattern) {
    case 'area_velocity_surge':
      messageBn = `${areaName} এলাকায় গত কয়েক মিনিটে ${metrics.count}টি লেনদেন হয়েছে, যা স্বাভাবিকের চেয়ে অনেক বেশি। এটি স্বাভাবিক চাহিদার কারণেও হতে পারে; তবে একজন দায়িত্বপ্রাপ্ত কর্মীকে পর্যালোচনা করতে হবে।`;
      break;
    case 'area_coordinated_pattern':
      messageBn = `${areaName} এলাকায় ${metrics.count}টি এজেন্টে একই ধরনের অস্বাভাবিক কার্যক্রম একই সময়ে শনাক্ত হয়েছে। এটি স্বাভাবিক চাহিদার কারণেও হতে পারে; তবে একজন দায়িত্বপ্রাপ্ত কর্মীকে পর্যালোচনা করতে হবে।`;
      break;
    default:
      messageBn = `${areaName} এলাকায় অস্বাভাবিক কার্যক্রম শনাক্ত হয়েছে। একজন দায়িত্বপ্রাপ্ত কর্মীকে পর্যালোচনা করতে হবে।`;
  }

  // English fallback
  const messageEn = `${evidence} This may reflect normal demand or a data issue. A responsible person must review the information before any action is taken.`;

  // Banglish fallback
  let messageBanglish;
  switch (pattern) {
    case 'area_velocity_surge':
      messageBanglish = `${areaName} elakay goto kisu minute-e ${metrics.count}ti transaction hoyeche, ja shabhabiker cheye onek beshi. Eti shabhabik demand-er karoneo hote pare; tobe ekjon dayittoprapto person-ke review korte hobe.`;
      break;
    case 'area_coordinated_pattern':
      messageBanglish = `${areaName} elakay ${metrics.count}ti agent-e eki dhoroner unusual activity eki shomoy-e detect hoyeche. Eti shabhabik demand-er karoneo hote pare; tobe ekjon dayittoprapto person-ke review korte hobe.`;
      break;
    default:
      messageBanglish = `${areaName} elakay unusual activity detect hoyeche. Ekjon dayittoprapto person-ke review korte hobe.`;
  }

  return {
    alert_id: `ALT-AREA-${hash}`,
    dedup_key: `AREA:${routingToken(areaName)}:${String(pattern).toUpperCase()}`,
    timestamp: new Date(detectedAt).toISOString(),
    alert_type: String(pattern).toUpperCase(),
    alert_level: 'area',
    severity: String(severity.level).toUpperCase(),
    severity_score: severity.score,
    severity_factors: severity.factors,
    area_name: areaName,
    agent_ids: agentIds,
    agent_count: agentIds.length,
    subject,
    evidence,
    message_en: messageEn,
    message_bn: messageBn,
    message_banglish: messageBanglish,
    context: context || 'This may reflect normal demand, a seasonal pattern, or activity that requires review.',
    recommended_action: recommendedAction || 'Have a territory manager review the area-wide activity with field workers before taking action.',
    safe_language_note: 'This alert indicates unusual area-wide activity and requires human review; it is not an automated conclusion.',
    workflow_status: 'NEW_UNASSIGNED',
    can_forward: true,
    recipient_type: 'manager',
    routing_targets: [...managerIds],
    metrics,
    message_source: 'deterministic',
  };
}

function createRegionalAlert({
  region,
  areaAlerts,
  metrics,
  evidence,
  context,
  recommendedAction,
  detectedAt,
  managerIds,
}) {
  const areaNames = areaAlerts.map((a) => a.area_name);
  const identity = ['regional_cascade', region, ...areaNames, detectedAt].join('|');
  const hash = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12).toUpperCase();
  const severity = calculateSeverity('regional_cascade', metrics);

  const subject = `Regional Cascade Alert: ${region}`;

  const messageBn = `${region} অঞ্চলে ${areaNames.length}টি এলাকায় একই সময়ে অস্বাভাবিক কার্যক্রম শনাক্ত হয়েছে (${areaNames.join(', ')})। এটি স্বাভাবিক চাহিদার কারণেও হতে পারে; তবে একজন দায়িত্বপ্রাপ্ত কর্মীকে পর্যালোচনা করতে হবে।`;
  const messageEn = `${evidence} This may reflect normal demand or a data issue. A responsible person must review the information before any action is taken.`;
  const messageBanglish = `${region} onchole ${areaNames.length}ti elakay eki shomoy-e unusual activity detect hoyeche (${areaNames.join(', ')}). Eti shabhabik demand-er karoneo hote pare; tobe ekjon dayittoprapto person-ke review korte hobe.`;

  return {
    alert_id: `ALT-RGN-${hash}`,
    dedup_key: `REGION:${routingToken(region)}:REGIONAL_CASCADE`,
    timestamp: new Date(detectedAt).toISOString(),
    alert_type: 'REGIONAL_CASCADE',
    alert_level: 'regional',
    severity: String(severity.level).toUpperCase(),
    severity_score: severity.score,
    severity_factors: severity.factors,
    region,
    affected_areas: areaNames,
    area_alert_count: areaAlerts.length,
    subject,
    evidence,
    message_en: messageEn,
    message_bn: messageBn,
    message_banglish: messageBanglish,
    context: context || 'Multiple areas in this region are showing unusual activity simultaneously, which may indicate a regional event or pattern.',
    recommended_action: recommendedAction || 'Have the regional management team review the cross-area activity and coordinate with field workers across affected areas.',
    safe_language_note: 'This alert indicates unusual regional activity and requires human review; it is not an automated conclusion.',
    workflow_status: 'NEW_UNASSIGNED',
    can_forward: true,
    recipient_type: 'manager',
    routing_targets: [...managerIds],
    triggered_area_alerts: areaAlerts.map((a) => a.alert_id),
    metrics,
    message_source: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Area-level detection rules
// ---------------------------------------------------------------------------

/**
 * Area Velocity Surge
 * Trigger: total transaction count across ALL agents in the area exceeds
 * the threshold within the analysis window.
 */
function detectAreaVelocitySurge(areaName, agents, config, detectedAt) {
  const windowMs = config.areaVelocityWindowMinutes * MINUTE_MS;
  const lowerBound = detectedAt - windowMs;

  // Pool all transactions from all agents in this area.
  let allTransactions = [];
  for (const agent of agents) {
    const txns = agent.recent_transactions || [];
    for (const txn of txns) {
      const ts = toTimestamp(txn.time || txn.timestamp || txn.created_at);
      if (ts !== null && ts >= lowerBound && ts <= detectedAt) {
        allTransactions.push({ ...txn, _agent_id: getAgentId(agent), _timestamp: ts });
      }
    }
  }

  if (allTransactions.length < config.areaVelocityMinimumCount) return null;

  const successCount = allTransactions.filter((t) => {
    const status = String(t.status || 'success').toLowerCase();
    return ['success', 'successful', 'completed', 'approved'].includes(status);
  }).length;

  const totalAmount = allTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const providers = [...new Set(allTransactions.map((t) => t.provider_id || t.provider).filter(Boolean))];
  const contributingAgents = [...new Set(allTransactions.map((t) => t._agent_id))];

  return createAreaAlert({
    pattern: 'area_velocity_surge',
    areaName,
    agents: agents.filter((a) => contributingAgents.includes(getAgentId(a))),
    metrics: {
      count: allTransactions.length,
      successCount,
      threshold: config.areaVelocityMinimumCount,
      totalAmount,
      providerCount: providers.length,
      providers,
      agentCount: contributingAgents.length,
      windowMinutes: config.areaVelocityWindowMinutes,
    },
    evidence: `Area "${areaName}" recorded ${allTransactions.length} transactions across ${contributingAgents.length} agents in the last ${config.areaVelocityWindowMinutes} minutes, totaling ${formatAmount(totalAmount)}.`,
    detectedAt,
    managerIds: new Set(),
  });
}

/**
 * Area Coordinated Pattern
 * Trigger: 3 or more agents in the same area independently trigger the same
 * per-agent anomaly pattern type within the analysis window.
 */
function detectAreaCoordinatedPattern(areaName, agents, config, detectedAt) {
  // Count how many agents triggered each pattern type.
  const patternAgents = new Map();

  for (const agent of agents) {
    const agentAlerts = agent.anomality_alert || [];
    const triggeredPatterns = new Set();

    for (const alert of agentAlerts) {
      const pattern = alert.alert_type || alert.pattern;
      if (pattern) triggeredPatterns.add(String(pattern).toLowerCase());
    }

    for (const pattern of triggeredPatterns) {
      if (!patternAgents.has(pattern)) patternAgents.set(pattern, []);
      patternAgents.get(pattern).push(agent);
    }
  }

  const alerts = [];
  for (const [pattern, matchingAgents] of patternAgents) {
    if (matchingAgents.length < config.coordinatedMinimumAgents) continue;

    const patternName = PATTERN_NAMES[pattern] || pattern;
    const agentIds = matchingAgents.map((a) => getAgentId(a));

    alerts.push(createAreaAlert({
      pattern: 'area_coordinated_pattern',
      areaName,
      agents: matchingAgents,
      metrics: {
        count: matchingAgents.length,
        threshold: config.coordinatedMinimumAgents,
        coordinatedPattern: pattern,
        coordinatedPatternName: patternName,
        agentCount: matchingAgents.length,
      },
      evidence: `${matchingAgents.length} agents in "${areaName}" (${agentIds.join(', ')}) independently triggered "${patternName}" alerts simultaneously.`,
      context: `Multiple agents in the same area showing the same pattern may indicate a localized event, seasonal demand, or coordinated activity that requires review.`,
      detectedAt,
      managerIds: new Set(),
    }));
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Timestamp helper (duplicated from anomalityAlert.js to keep module standalone)
// ---------------------------------------------------------------------------

function toTimestamp(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Main orchestration
// ---------------------------------------------------------------------------

/**
 * Run area-level and regional anomaly detection across all agents.
 *
 * @param {Object} input
 * @param {Array}  input.agents   - All agent objects (already processed with per-agent alerts).
 * @param {Array}  input.managers - All manager objects.
 * @param {Object} input.config   - Optional threshold overrides.
 * @param {number|string} input.now - Optional timestamp override.
 * @returns {{ area_alerts: Array, regional_alerts: Array }}
 */
function detectAreaAnomalies({ agents = [], managers = [], config: overrides, now } = {}) {
  const config = { ...DEFAULT_CONFIG, ...AREA_CONFIG, ...overrides };
  const explicitNow = toTimestamp(now);
  const detectedAt = explicitNow || Date.now();

  const areaGroups = groupAgentsByArea(agents);
  const regionManagerMap = groupManagersByRegion(managers);

  const areaAlerts = [];
  const areaAlertsByRegion = new Map();

  // --- Run area-level rules ---
  for (const [areaName, group] of areaGroups) {
    const { agents: areaAgents, managerIds } = group;

    // 1. Area velocity surge
    const velocityAlert = detectAreaVelocitySurge(areaName, areaAgents, config, detectedAt);
    if (velocityAlert) {
      velocityAlert.routing_targets = [...managerIds];
      areaAlerts.push(velocityAlert);
    }

    // 2. Area coordinated pattern
    const coordAlerts = detectAreaCoordinatedPattern(areaName, areaAgents, config, detectedAt);
    for (const alert of coordAlerts) {
      alert.routing_targets = [...managerIds];
      areaAlerts.push(alert);
    }
  }

  // --- Determine which regions have area-level alerts ---
  for (const alert of areaAlerts) {
    const areaManagerIds = new Set(alert.routing_targets || []);
    const regions = findRegionsForArea(areaManagerIds, managers);
    for (const region of regions) {
      if (!areaAlertsByRegion.has(region)) areaAlertsByRegion.set(region, []);
      areaAlertsByRegion.get(region).push(alert);
    }
  }

  // --- Run regional cascade rule ---
  const regionalAlerts = [];
  for (const [region, regionAreaAlerts] of areaAlertsByRegion) {
    // Count distinct areas that triggered alerts.
    const distinctAreas = new Set(regionAreaAlerts.map((a) => a.area_name));
    if (distinctAreas.size < config.cascadeMinimumAreas) continue;

    const regionManagers = regionManagerMap.get(region) || new Set();

    regionalAlerts.push(createRegionalAlert({
      region,
      areaAlerts: regionAreaAlerts,
      metrics: {
        count: distinctAreas.size,
        threshold: config.cascadeMinimumAreas,
        totalAreaAlerts: regionAreaAlerts.length,
        affectedAreas: [...distinctAreas],
      },
      evidence: `Region "${region}" has ${distinctAreas.size} areas (${[...distinctAreas].join(', ')}) with active area-level anomaly alerts simultaneously.`,
      detectedAt,
      managerIds: regionManagers,
    }));
  }

  return {
    analyzed_at: new Date(detectedAt).toISOString(),
    area_count: areaGroups.size,
    area_alerts: areaAlerts,
    area_alert_count: areaAlerts.length,
    regional_alerts: regionalAlerts,
    regional_alert_count: regionalAlerts.length,
  };
}

/**
 * Attach area and regional alerts to the appropriate manager objects.
 * Mutates the manager objects in place and returns the updated managers array.
 */
function attachAreaAlertsToManagers(result, managers = []) {
  // Initialize empty arrays on all managers.
  for (const manager of managers) {
    if (!manager.area_alerts) manager.area_alerts = [];
    if (!manager.regional_alerts) manager.regional_alerts = [];
  }

  // Route area alerts to their target managers.
  for (const alert of result.area_alerts) {
    for (const targetId of (alert.routing_targets || [])) {
      const manager = managers.find((m) => m.manager_id === targetId);
      if (manager) manager.area_alerts.push(alert);
    }
  }

  // Route regional alerts to their target managers.
  for (const alert of result.regional_alerts) {
    for (const targetId of (alert.routing_targets || [])) {
      const manager = managers.find((m) => m.manager_id === targetId);
      if (manager) manager.regional_alerts.push(alert);
    }
  }

  return managers;
}

module.exports = {
  AREA_CONFIG,
  detectAreaAnomalies,
  attachAreaAlertsToManagers,
};
