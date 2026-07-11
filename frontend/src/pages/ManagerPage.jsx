import {
  AlertTriangle,
  BriefcaseBusiness,
  Gauge,
  MapPinned,
  ShieldCheck,
} from 'lucide-react';

function ManagerPage({ activeManager, managerIssueCount }) {
  return (
    <>
      <section className="summary-grid" aria-label="Manager summary">
        <article className="metric">
          <ShieldCheck size={22} />
          <span>System Health</span>
          <strong>{activeManager.system_health_status}</strong>
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
            {activeManager.active_bottlenecks.map((issue) => (
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
            {activeManager.flagged_entities.map((entity) => (
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
