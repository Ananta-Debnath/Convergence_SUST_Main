const { readJsonDb } = require('../database/db');
const { detectAreaAnomalies, attachAreaAlertsToManagers } = require('../services/areaAnomalyDetector');

/**
 * GET /area-alerts
 * Returns all area-level and regional alerts across all areas and regions.
 */
const getAllAreaAlerts = async (req, res) => {
  try {
    const data = await readJsonDb();
    const agents = data.agents || [];
    const managers = data.managers || [];

    const result = detectAreaAnomalies({ agents, managers, now: req.query.now });

    return res.status(200).json({ status: 'ok', ...result });
  } catch (error) {
    console.error('Error in getAllAreaAlerts controller:', error);
    return res.status(500).json({ status: 'error', message: 'Unable to analyze area alerts' });
  }
};

/**
 * GET /areas/:areaName/alerts
 * Returns area-level alerts for a specific area.
 */
const getAreaAlerts = async (req, res) => {
  try {
    const { areaName } = req.params;
    const data = await readJsonDb();
    const agents = data.agents || [];
    const managers = data.managers || [];

    const result = detectAreaAnomalies({ agents, managers, now: req.query.now });

    const areaAlerts = result.area_alerts.filter(
      (a) => a.area_name.toLowerCase() === decodeURIComponent(areaName).toLowerCase()
    );

    return res.status(200).json({
      status: 'ok',
      area_name: decodeURIComponent(areaName),
      area_alerts: areaAlerts,
      area_alert_count: areaAlerts.length,
    });
  } catch (error) {
    console.error('Error in getAreaAlerts controller:', error);
    return res.status(500).json({ status: 'error', message: 'Unable to analyze area alerts' });
  }
};

/**
 * GET /regions/:region/alerts
 * Returns regional cascade alerts for a specific managed region.
 */
const getRegionAlerts = async (req, res) => {
  try {
    const { region } = req.params;
    const data = await readJsonDb();
    const agents = data.agents || [];
    const managers = data.managers || [];

    const result = detectAreaAnomalies({ agents, managers, now: req.query.now });

    const regionAlerts = result.regional_alerts.filter(
      (a) => a.region.toLowerCase() === decodeURIComponent(region).toLowerCase()
    );

    // Also include area alerts that fall within this region.
    const regionManagerIds = new Set(
      managers
        .filter((m) => (m.managed_region || '').toLowerCase() === decodeURIComponent(region).toLowerCase())
        .map((m) => m.manager_id)
    );
    const areaAlerts = result.area_alerts.filter(
      (a) => (a.routing_targets || []).some((t) => regionManagerIds.has(t))
    );

    return res.status(200).json({
      status: 'ok',
      region: decodeURIComponent(region),
      regional_alerts: regionAlerts,
      regional_alert_count: regionAlerts.length,
      area_alerts: areaAlerts,
      area_alert_count: areaAlerts.length,
    });
  } catch (error) {
    console.error('Error in getRegionAlerts controller:', error);
    return res.status(500).json({ status: 'error', message: 'Unable to analyze regional alerts' });
  }
};

module.exports = { getAllAreaAlerts, getAreaAlerts, getRegionAlerts };
