import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Gauge,
  History,
  MapPinned,
} from 'lucide-react';

function AgentPage({ activeAgent, providerBalances, alerts, physicalCash, coverage, formatBDT }) {
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
          <strong>{activeAgent?.area_name ?? 'Unassigned'}</strong>
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

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Transaction desk</p>
              <h2>Recent transactions</h2>
            </div>
            <History size={22} />
          </div>

          <div className="alert-list">
            {activeAgent?.recent_transactions && activeAgent.recent_transactions.length > 0 ? (
              activeAgent.recent_transactions.map((tx) => (
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
