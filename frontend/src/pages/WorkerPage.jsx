import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  ClipboardList,
  MapPinned,
  UserCheck,
} from 'lucide-react';

function WorkerPage({ agent: activeWorker, cases }) {
  const coveredAreas = activeWorker?.routing_logic?.covered_areas ?? activeWorker?.covered_areas ?? [];
  const assignedCases = activeWorker?.active_workload?.assigned_cases ?? activeWorker?.assigned_cases ?? [];
  const unassignedCases = activeWorker?.active_workload?.unassigned_cases ?? activeWorker?.unassigned_cases ?? [];
  const workerCaseCount = assignedCases.length + unassignedCases.length;

  return (
    <>
      <section className="summary-grid" aria-label="Field worker summary">
        <article className="metric">
          <UserCheck size={22} />
          <span>Status</span>
          <strong>{activeWorker.contact_status}</strong>
        </article>
        <article className="metric">
          <BriefcaseBusiness size={22} />
          <span>Provider</span>
          <strong>{activeWorker.provider_id}</strong>
        </article>
        <article className="metric alert">
          <AlertTriangle size={22} />
          <span>Case Load</span>
          <strong>{workerCaseCount}</strong>
        </article>
        <article className="metric">
          <MapPinned size={22} />
          <span>Coverage</span>
          <strong>{coveredAreas.length} zones</strong>
        </article>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Route plan</p>
              <h2>Covered areas</h2>
            </div>
            <MapPinned size={22} />
          </div>
          <div className="balance-list">
            {coveredAreas.map((area) => (
              <article className="balance-row" key={area}>
                <div className="row-top">
                  <strong>{area}</strong>
                  <span className="status stable">Assigned</span>
                </div>
                <div className="row-meta">
                  <span>{activeWorker.provider_id} field route</span>
                  <span>{activeWorker.name}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Work queue</p>
              <h2>Cases to handle</h2>
            </div>
            <ClipboardList size={22} />
          </div>
          <div className="alert-list">
            {[...assignedCases, ...unassignedCases].map((caseId) => {
              const item = cases.find((c) => c.case_id === caseId);
              const assigned = assignedCases.includes(caseId);
              return (
                <article className="alert-item" key={caseId}>
                  <div>
                    <span className={`severity ${assigned ? 'medium' : 'high'}`}>
                      {assigned ? 'Assigned' : 'Unassigned'}
                    </span>
                    <h3>{caseId}</h3>
                    <p>{item?.evidence ?? 'Follow up with nearby agent and update status.'}</p>
                  </div>
                  <div className="owner">
                    <span>{activeWorker.provider_id}</span>
                    <ArrowRight size={18} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

export default WorkerPage;
