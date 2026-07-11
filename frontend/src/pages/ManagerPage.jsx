import {
  AlertTriangle,
  BriefcaseBusiness,
  Gauge,
  MapPinned,
  ShieldCheck,
} from 'lucide-react';

function ManagerPage({ agent: activeManager }) {
  const managerHealthStatus = activeManager?.monitoring_dashboard?.system_health_status
    ?? activeManager?.system_health_status
    ?? 'unknown';
  const activeBottlenecks = (
    activeManager?.monitoring_dashboard?.active_bottlenecks
    ?? activeManager?.active_bottlenecks
    ?? []
  ).map((bottleneck) => (
    typeof bottleneck === 'string'
      ? bottleneck
      : `${bottleneck.location}: ${bottleneck.issue_type} (${bottleneck.severity})`
  ));
  const flaggedEntities = (activeManager?.flagged_entities ?? [])
    .map((entity) => (typeof entity === 'string' ? { entity_id: entity, flag_reason: '' } : entity));
  const managerIssueCount = activeBottlenecks.length + flaggedEntities.length;

  return (
    <>
      <section className="summary-grid" aria-label="Manager summary">
        <article className="metric">
          <ShieldCheck size={22} />
          <span>System Health</span>
          <strong>{managerHealthStatus}</strong>
        </article>
        <article className="metric">
          <BriefcaseBusiness size={22} />
          <span>Provider</span>
          <strong>{activeManager.provider_id}</strong>
        </article>
        <article className="metric alert">
          <AlertTriangle size={22} />
          <span>Issues</span>
          <strong>{managerIssueCount}</strong>
        </article>
        <article className="metric">
          <MapPinned size={22} />
          <span>Region</span>
          <strong>{activeManager.managed_region}</strong>
        </article>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">System view</p>
              <h2>Active bottlenecks</h2>
            </div>
            <Gauge size={22} />
          </div>
          <div className="alert-list">
            {activeBottlenecks.map((issue) => (
              <article className="alert-item" key={issue}>
                <div>
                  <span className="severity high">Needs review</span>
                  <h3>{issue}</h3>
                  <p>Assign field support and monitor liquidity movement in this region.</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Risk desk</p>
              <h2>Flagged entities</h2>
            </div>
            <ShieldCheck size={22} />
          </div>
          <div className="balance-list">
            {flaggedEntities.map((entity) => (
              <article className="balance-row" key={entity.entity_id}>
                <div className="row-top">
                  <strong>{entity.entity_id}</strong>
                  <span className="status watch">Flagged</span>
                </div>
                <div className="row-meta">
                  <span>{entity.flag_reason || `${activeManager.provider_id} risk monitoring`}</span>
                  <span>{activeManager.managed_region}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default ManagerPage;
