import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  ClipboardList,
  Gauge,
  History,
  MapPinned,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from 'lucide-react';
import { fetchAgents, fetchCases } from '../api';

const mockAgents = [
  {
    agent_id: 'AGT-8472',
    business_name: 'Molla Telecom',
    area_name: 'Sylhet Sadar',
    balances: {
      shared_physical_cash: 125000,
      provider_e_money: {
        bKash: 15000,
        Nagad: 8500,
        Rocket: 32000,
      },
    },
    recent_transactions: [
      {
        transaction_id: 'TXN-9901',
        provider_id: 'bKash',
        time: '2026-07-11T11:15:00Z',
        transaction_type: 'cash-out',
        amount: 10000,
        status: 'success',
        event_flags: []
      },
      {
        transaction_id: 'TXN-9902',
        provider_id: 'Nagad',
        time: '2026-07-11T11:22:00Z',
        transaction_type: 'cash-in',
        amount: 2000,
        status: 'success',
        event_flags: []
      }
    ]
  },
  {
    agent_id: 'AGT-BK-405',
    business_name: 'Zindabazar Digital Point',
    area_name: 'Zindabazar',
    balances: {
      shared_physical_cash: 92000,
      provider_e_money: {
        bKash: 28000,
        Nagad: 12000,
        Rocket: 18000,
      },
    },
  },
];

const mockFieldWorkers = [
  {
    worker_id: 'FW-NG-9921',
    name: 'Tariqul Islam',
    provider_id: 'Nagad',
    contact_status: 'active',
    covered_areas: ['Sylhet Sadar', 'Zindabazar'],
    assigned_cases: ['CASE-1001'],
    unassigned_cases: ['CASE-1002'],
  },
  {
    worker_id: 'FW-BK-101',
    name: 'Sabina Akter',
    provider_id: 'bKash',
    contact_status: 'active',
    covered_areas: ['Amberkhana', 'Subidbazar'],
    assigned_cases: ['CASE-3001'],
    unassigned_cases: [],
  },
  {
    worker_id: 'FW-RK-210',
    name: 'Mahmud Hasan',
    provider_id: 'Rocket',
    contact_status: 'standby',
    covered_areas: ['Tilagor', 'Shibganj'],
    assigned_cases: [],
    unassigned_cases: ['CASE-4102'],
  },
];

const mockManagers = [
  {
    manager_id: 'MGR-BK-SYL-01',
    provider_id: 'bKash',
    managed_region: 'Greater Sylhet',
    system_health_status: 'warning',
    active_bottlenecks: ['Sylhet Sadar liquidity drain', 'Zindabazar case backlog'],
    flagged_entities: ['01711223344', 'AGT-BK-405'],
  },
  {
    manager_id: 'MGR-NG-SYL-02',
    provider_id: 'Nagad',
    managed_region: 'Sylhet Metro',
    system_health_status: 'stable',
    active_bottlenecks: ['Nagad top-up pressure'],
    flagged_entities: ['AGT-8472'],
  },
];

const mockCases = [
  {
    case_id: 'CASE-1001',
    agent_id: 'AGT-8472',
    alert_type: 'unusual_activity',
    status: 'acknowledged',
    owner_worker_id: 'FW-NG-9921',
    evidence: 'Repeated near-identical cash-out amounts from 3 accounts.',
  },
  {
    case_id: 'CASE-1002',
    agent_id: 'AGT-8472',
    alert_type: 'liquidity_pressure',
    status: 'open',
    owner_worker_id: null,
    evidence: 'Nagad e-money balance dropping rapidly; projected to deplete in 45 mins.',
  },
];

const formatBDT = (value) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(value);

const getInitialRoute = () => {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  const id = params.get('id');

  if (role === 'worker' && mockFieldWorkers.some((worker) => worker.worker_id === id)) {
    return { role, id };
  }

  if (role === 'manager' && mockManagers.some((manager) => manager.manager_id === id)) {
    return { role, id };
  }

  if (role === 'agent' && id) {
    return { role, id };
  }

  return { role: 'agent', id: mockAgents[0].agent_id };
};

const updateMemberUrl = (role, id) => {
  const url = new URL(window.location.href);
  url.searchParams.set('role', role);
  url.searchParams.set('id', id);
  window.history.pushState({}, '', url);
};

function Dashboard() {
  const initialRoute = getInitialRoute();
  const [agents, setAgents] = useState([]);
  const [cases, setCases] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(
    initialRoute.role === 'agent' ? initialRoute.id : mockAgents[0].agent_id,
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState(
    initialRoute.role === 'worker' ? initialRoute.id : mockFieldWorkers[0].worker_id,
  );
  const [selectedManagerId, setSelectedManagerId] = useState(
    initialRoute.role === 'manager' ? initialRoute.id : mockManagers[0].manager_id,
  );
  const [activeRole, setActiveRole] = useState(initialRoute.role);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchCases()])
      .then(([agentsData, casesData]) => {
        const nextAgents = agentsData.length ? agentsData : mockAgents;
        const routeAgentExists = nextAgents.some((agent) => agent.agent_id === selectedAgentId);
        const nextAgentId = routeAgentExists ? selectedAgentId : nextAgents[0]?.agent_id ?? mockAgents[0].agent_id;
        setAgents(nextAgents);
        setCases(casesData.length ? casesData : mockCases);
        setSelectedAgentId(nextAgentId);
        if (activeRole === 'agent') {
          updateMemberUrl('agent', nextAgentId);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('API Fetch error:', err);
        setAgents(mockAgents);
        setCases(mockCases);
        const routeAgentExists = mockAgents.some((agent) => agent.agent_id === selectedAgentId);
        const nextAgentId = routeAgentExists ? selectedAgentId : mockAgents[0].agent_id;
        setSelectedAgentId(nextAgentId);
        if (activeRole === 'agent') {
          updateMemberUrl('agent', nextAgentId);
        }
        setLoading(false);
      });
  }, [activeRole, selectedAgentId]);

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = getInitialRoute();
      setActiveRole(nextRoute.role);

      if (nextRoute.role === 'agent') {
        setSelectedAgentId(nextRoute.id);
      } else if (nextRoute.role === 'worker') {
        setSelectedWorkerId(nextRoute.id);
      } else if (nextRoute.role === 'manager') {
        setSelectedManagerId(nextRoute.id);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const renderRoleSelectors = () => (
    <div className="role-selectors" aria-label="Role directory">
      <div className="role-selectors-title">
        <UsersRound size={18} />
        <span>Role switcher</span>
      </div>
      <label className="role-select">
        <span>Agents</span>
        <select
          value={selectedAgentId}
          onChange={(event) => {
            setSelectedAgentId(event.target.value);
            setActiveRole('agent');
            updateMemberUrl('agent', event.target.value);
          }}
        >
          {agents.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agent.business_name} ({agent.agent_id})
            </option>
          ))}
        </select>
      </label>
      <label className="role-select">
        <span>Field Workers</span>
        <select
          value={selectedWorkerId}
          onChange={(event) => {
            setSelectedWorkerId(event.target.value);
            setActiveRole('worker');
            updateMemberUrl('worker', event.target.value);
          }}
        >
          {mockFieldWorkers.map((worker) => (
            <option key={worker.worker_id} value={worker.worker_id}>
              {worker.name} - {worker.provider_id}
            </option>
          ))}
        </select>
      </label>
      <label className="role-select">
        <span>Managers</span>
        <select
          value={selectedManagerId}
          onChange={(event) => {
            setSelectedManagerId(event.target.value);
            setActiveRole('manager');
            updateMemberUrl('manager', event.target.value);
          }}
        >
          {mockManagers.map((manager) => (
            <option key={manager.manager_id} value={manager.manager_id}>
              {manager.provider_id} - {manager.managed_region}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  if (loading) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="header-left">
            {renderRoleSelectors()}
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

  const activeAgent = agents.find((agent) => agent.agent_id === selectedAgentId) ?? agents[0];
  const activeWorker = mockFieldWorkers.find((worker) => worker.worker_id === selectedWorkerId) ?? mockFieldWorkers[0];
  const activeManager = mockManagers.find((manager) => manager.manager_id === selectedManagerId) ?? mockManagers[0];
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

  const workerCaseCount = activeWorker.assigned_cases.length + activeWorker.unassigned_cases.length;
  const managerIssueCount = activeManager.active_bottlenecks.length + activeManager.flagged_entities.length;

  const roleCopy = {
    agent: {
      eyebrow: 'Agent console',
      title: `${activeAgent?.business_name ?? 'Agent'} Liquidity View`,
    },
    worker: {
      eyebrow: 'Field worker console',
      title: `${activeWorker.name} Field Operations`,
    },
    manager: {
      eyebrow: 'Manager console',
      title: `${activeManager.provider_id} Regional Oversight`,
    },
  };

  const renderAgentView = () => (
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

  const renderWorkerView = () => (
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
          <strong>{activeWorker.covered_areas.length} zones</strong>
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
            {activeWorker.covered_areas.map((area) => (
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
            {[...activeWorker.assigned_cases, ...activeWorker.unassigned_cases].map((caseId) => {
              const item = cases.find((c) => c.case_id === caseId);
              const assigned = activeWorker.assigned_cases.includes(caseId);
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

  const renderManagerView = () => (
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
              <article className="balance-row" key={entity}>
                <div className="row-top">
                  <strong>{entity}</strong>
                  <span className="status watch">Flagged</span>
                </div>
                <div className="row-meta">
                  <span>{activeManager.provider_id} risk monitoring</span>
                  <span>{activeManager.managed_region}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  const renderActiveRoleView = () => {
    if (activeRole === 'worker') {
      return renderWorkerView();
    }

    if (activeRole === 'manager') {
      return renderManagerView();
    }

    return renderAgentView();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="header-left">
          {renderRoleSelectors()}
          <p className="eyebrow">{roleCopy[activeRole].eyebrow}</p>
          <h1>{roleCopy[activeRole].title}</h1>
        </div>
        <button className="icon-button" aria-label="Review case queue" title="Review case queue">
          <ClipboardList size={20} />
        </button>
      </header>

      {renderActiveRoleView()}
    </main>
  );
}

export default Dashboard;
