import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  ClipboardList,
  Gauge,
  ShieldCheck,
} from 'lucide-react';
import { fetchAgents, fetchCases } from '../api';

const formatBDT = (value) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(value);

function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchCases()])
      .then(([agentsData, casesData]) => {
        setAgents(agentsData);
        setCases(casesData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('API Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);


  if (loading) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">SUST CSE Carnival 2026</p>
            <h1>Super Agent Liquidity & Risk Intelligence</h1>
          </div>
        </header>
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading real-time liquidity and risk telemetry...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">SUST CSE Carnival 2026</p>
            <h1>Super Agent Liquidity & Risk Intelligence</h1>
          </div>
        </header>
        <div className="error-container">
          <AlertTriangle size={48} style={{ marginBottom: '16px' }} />
          <h2>Connection Failure</h2>
          <p>{error}</p>
          <button 
            className="icon-button" 
            style={{ width: 'auto', padding: '0 20px', marginTop: '20px' }}
            onClick={() => {
              setLoading(true);
              setError(null);
              // Trigger a reload
              window.location.reload();
            }}
          >
            Retry Connection
          </button>
        </div>
      </main>
    );
  }

  const activeAgent = agents[0];
  const physicalCash = activeAgent?.balances?.shared_physical_cash ?? 0;

  const bKashBalance = activeAgent?.balances?.provider_e_money?.bKash ?? 0;
  const nagadBalance = activeAgent?.balances?.provider_e_money?.Nagad ?? 0;
  const rocketBalance = activeAgent?.balances?.provider_e_money?.Rocket ?? 0;

  const providerBalances = [
    { name: 'bKash', balance: bKashBalance, demand: 92000 },
    { name: 'Nagad', balance: nagadBalance, demand: 76000 },
    { name: 'Rocket', balance: rocketBalance, demand: 39000 },
  ].map((provider) => {
    const percent = Math.min(Math.round((provider.balance / provider.demand) * 100), 130);
    let status = 'Stable';
    if (percent < 50) {
      status = 'Pressure';
    } else if (percent < 80) {
      status = 'Watch';
    }
    return {
      ...provider,
      percent,
      status,
    };
  });

  const totalBalance = providerBalances.reduce((sum, item) => sum + item.balance, 0);
  const totalDemand = providerBalances.reduce((sum, item) => sum + item.demand, 0);
  const coverage = totalDemand > 0 ? Math.round((totalBalance / totalDemand) * 100) : 0;

  const alerts = cases.map((c) => {
    let title = 'System Alert';
    let detail = c.evidence || 'No details provided';
    let owner = 'Operations';
    let severity = 'Medium';

    if (c.alert_type === 'unusual_activity') {
      title = 'Repeated same-amount cash-out pattern';
      severity = 'Medium';
      owner = 'Risk analyst';
    } else if (c.alert_type === 'liquidity_pressure') {
      title = 'Nagad balance may run short';
      severity = 'High';
      owner = 'Field officer';
    }

    if (c.owner_worker_id === 'FW-NG-9921') {
      owner = 'Tariqul Islam';
    }

    return {
      title,
      detail,
      owner,
      severity,
      id: c.case_id,
    };
  });

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
          <strong>{formatBDT(physicalCash)}</strong>
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
              return (
                <article className="balance-row" key={provider.name}>
                  <div className="row-top">
                    <strong>{provider.name}</strong>
                    <span className={`status ${provider.status.toLowerCase()}`}>{provider.status}</span>
                  </div>
                  <div className="bar" aria-label={`${provider.name} coverage`}>
                    <span style={{ width: `${Math.min(provider.percent, 100)}%` }} />
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
              <article className="alert-item" key={alert.id || alert.title}>
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
