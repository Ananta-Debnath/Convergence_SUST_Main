import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Gauge,
  History,
  MapPinned,
} from 'lucide-react';

function AgentPage({ agent, cases, formatBDT }) {
  const physicalCash  = agent?.balances?.shared_physical_cash ?? 0;
  const bKashBalance  = agent?.balances?.provider_e_money?.bKash  ?? 0;
  const nagadBalance  = agent?.balances?.provider_e_money?.Nagad  ?? 0;
  const rocketBalance = agent?.balances?.provider_e_money?.Rocket ?? 0;

  const predictions = agent?.operational_metrics?.liquidity_predictions ?? {};
  const demandFromPrediction = (key, balance) => {
    const rate = predictions[key]?.net_drain_rate_per_min;
    if (rate && rate > 0) return Math.round(rate * 30);
    return Math.round(balance * 1.5) || 1;
  };

  const providerBalances = [
    { name: 'bKash',  balance: bKashBalance,  demand: demandFromPrediction('bKash',  bKashBalance)  },
    { name: 'Nagad',  balance: nagadBalance,   demand: demandFromPrediction('Nagad',  nagadBalance)  },
    { name: 'Rocket', balance: rocketBalance,  demand: demandFromPrediction('Rocket', rocketBalance) },
  ].map((provider) => {
    const percent = Math.min(Math.round((provider.balance / provider.demand) * 100), 130);
    let status = 'Stable';
    if (percent < 50) status = 'Pressure';
    else if (percent < 80) status = 'Watch';
    return { ...provider, percent, status };
  });

  const totalBalance = providerBalances.reduce((sum, p) => sum + p.balance, 0);
  const totalDemand  = providerBalances.reduce((sum, p) => sum + p.demand,  0);
  const coverage     = totalDemand > 0 ? Math.round((totalBalance / totalDemand) * 100) : 0;

  const mapSeverity = (severityString) => {
    if (!severityString) return 'Medium';
    const s = severityString.toLowerCase();
    if (s === 'critical' || s === 'high') return 'High';
    if (s === 'warning' || s === 'medium') return 'Medium';
    return 'Low';
  };

  const normalAlerts = (agent?.active_alerts ?? []).map((a) => ({
    id:       a.alert_id,
    title:    a.title || 'System Alert',
    detail:   a.message_en || a.evidence || 'No details provided',
    owner:    a.responsible_role || 'Operations',
    severity: mapSeverity(a.severity),
  }));

  const anomalyAlerts = (agent?.anomality_alert ?? []).map((a) => ({
    id:       a.alert_id,
    title:    a.title || 'Anomaly Alert',
    detail:   a.message_en || a.evidence || 'No details provided',
    owner:    a.responsible_role || 'Operations',
    severity: mapSeverity(a.severity),
  }));

  const alerts = [...normalAlerts, ...anomalyAlerts];

  return (
    <>
      <section className="summary-grid" aria-label="Agent operational summary">
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
          <MapPinned size={22} />
          <span>Area</span>
          <strong>{agent?.area_name ?? 'Unassigned'}</strong>
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
            {providerBalances.map((provider) => (
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
            ))}
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
            {alerts.length > 0 ? (
              alerts.map((alert) => (
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
              ))
            ) : (
              <p style={{ color: '#55706d', fontStyle: 'italic', padding: '16px 0' }}>No active alerts recorded.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Transaction desk</p>
              <h2>Recent transactions</h2>
            </div>
            <History size={22} />
          </div>

          <div className="alert-list">
            {agent?.recent_transactions?.length > 0 ? (
              agent.recent_transactions.map((tx) => (
                <article className="alert-item" key={tx.transaction_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`severity ${tx.transaction_type === 'cash-out' ? 'high' : 'medium'}`}>
                        {tx.transaction_type}
                      </span>
                      <h3>{tx.transaction_id}</h3>
                    </div>
                    <strong style={{ fontSize: '1.05rem', color: '#163b35' }}>
                      {formatBDT(tx.amount)}
                    </strong>
                  </div>
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem' }}>
                    Status: <strong style={{ color: tx.status === 'success' ? '#2e7d32' : '#c62828' }}>{tx.status}</strong> via {tx.provider_id}
                  </p>
                  <div className="owner" style={{ marginTop: '8px', borderTop: '1px solid #e4ece8', paddingTop: '8px', fontSize: '0.78rem', color: '#55706d' }}>
                    <span>{new Date(tx.time).toUTCString()}</span>
                  </div>
                </article>
              ))
            ) : (
              <p style={{ color: '#55706d', fontStyle: 'italic', padding: '16px 0' }}>No recent transactions recorded.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export default AgentPage;
