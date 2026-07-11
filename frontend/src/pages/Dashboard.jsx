import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  ClipboardList,
  Gauge,
  ShieldCheck,
} from 'lucide-react';

const providerBalances = [
  { name: 'bKash', balance: 128000, demand: 92000, status: 'Stable' },
  { name: 'Nagad', balance: 64000, demand: 76000, status: 'Pressure' },
  { name: 'Rocket', balance: 42000, demand: 39000, status: 'Watch' },
];

const alerts = [
  {
    title: 'Nagad balance may run short',
    detail: 'Projected demand exceeds available e-money by 12,000 BDT.',
    owner: 'Provider operations',
    severity: 'High',
  },
  {
    title: 'Repeated same-amount cash-out pattern',
    detail: 'Six similar requests from nearby accounts within 18 minutes.',
    owner: 'Risk analyst',
    severity: 'Medium',
  },
  {
    title: 'Shared cash drawer below target',
    detail: 'Physical cash can cover 73% of estimated next-hour demand.',
    owner: 'Field officer',
    severity: 'Medium',
  },
];

const formatBDT = (value) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(value);

function Dashboard() {
  const totalBalance = providerBalances.reduce((sum, item) => sum + item.balance, 0);
  const totalDemand = providerBalances.reduce((sum, item) => sum + item.demand, 0);
  const coverage = Math.round((totalBalance / totalDemand) * 100);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SUST CSE Carnival 2026</p>
          <h1>Super Agent Liquidity & Risk Intelligence</h1>
        </div>
        <button className="icon-button" aria-label="Review case queue" title="Review case queue">
          <ClipboardList size={20} />
        </button>
      </header>

      <section className="summary-grid" aria-label="Operational summary">
        <article className="metric">
          <Banknote size={22} />
          <span>Shared Cash</span>
          <strong>{formatBDT(186000)}</strong>
        </article>
        <article className="metric">
          <Gauge size={22} />
          <span>Provider Coverage</span>
          <strong>{coverage}%</strong>
        </article>
        <article className="metric alert">
          <AlertTriangle size={22} />
          <span>Open Alerts</span>
          <strong>{alerts.length}</strong>
        </article>
        <article className="metric">
          <ShieldCheck size={22} />
          <span>Decision Mode</span>
          <strong>Review only</strong>
        </article>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Liquidity view</p>
              <h2>Provider positions</h2>
            </div>
            <BadgeCheck size={22} />
          </div>

          <div className="balance-list">
            {providerBalances.map((provider) => {
              const percent = Math.min(Math.round((provider.balance / provider.demand) * 100), 130);

              return (
                <article className="balance-row" key={provider.name}>
                  <div className="row-top">
                    <strong>{provider.name}</strong>
                    <span className={`status ${provider.status.toLowerCase()}`}>{provider.status}</span>
                  </div>
                  <div className="bar" aria-label={`${provider.name} coverage`}>
                    <span style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                  <div className="row-meta">
                    <span>{formatBDT(provider.balance)} available</span>
                    <span>{formatBDT(provider.demand)} demand</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Coordination</p>
              <h2>Alert queue</h2>
            </div>
            <AlertTriangle size={22} />
          </div>

          <div className="alert-list">
            {alerts.map((alert) => (
              <article className="alert-item" key={alert.title}>
                <div>
                  <span className={`severity ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                  <h3>{alert.title}</h3>
                  <p>{alert.detail}</p>
                </div>
                <div className="owner">
                  <span>{alert.owner}</span>
                  <ArrowRight size={18} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default Dashboard;
