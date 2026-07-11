import { useState, useEffect } from 'react';
import { ClipboardList, UsersRound } from 'lucide-react';
import { fetchAgents, fetchCases, fetchFieldWorkers, fetchManagers } from '../api';
import AgentPage from './AgentPage';
import WorkerPage from './WorkerPage';
import ManagerPage from './ManagerPage';

const formatBDT = (value) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(value);

const validRoles = ['agent', 'worker', 'manager'];

const buildMemberPath = (role, id) => `/${role}/${encodeURIComponent(id)}`;

const getInitialRoute = () => {
  const [role, encodedId] = window.location.pathname.split('/').filter(Boolean);
  const id = encodedId ? decodeURIComponent(encodedId) : '';
  if (validRoles.includes(role) && id) return { role, id };
  return { role: 'agent', id: '' };
};

const updateMemberUrl = (role, id, method = 'push') => {
  const path = buildMemberPath(role, id);
  if (window.location.pathname === path) return;
  const historyMethod = method === 'replace' ? 'replaceState' : 'pushState';
  window.history[historyMethod]({}, '', path);
};

function EmptyState({ message }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#55706d', fontStyle: 'italic' }}>
      {message}
    </div>
  );
}

function Dashboard() {
  const initialRoute = getInitialRoute();
  const [agents, setAgents] = useState([]);
  const [cases, setCases] = useState([]);
  const [fieldWorkers, setFieldWorkers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(initialRoute.role === 'agent' ? initialRoute.id : '');
  const [selectedWorkerId, setSelectedWorkerId] = useState(initialRoute.role === 'worker' ? initialRoute.id : '');
  const [selectedManagerId, setSelectedManagerId] = useState(initialRoute.role === 'manager' ? initialRoute.id : '');
  const [activeRole, setActiveRole] = useState(initialRoute.role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchCases(), fetchFieldWorkers(), fetchManagers()])
      .then(([agentsData, casesData, workersData, managersData]) => {
        setAgents(agentsData);
        setCases(casesData);
        setFieldWorkers(workersData);
        setManagers(managersData);

        setSelectedAgentId((prev) => {
          const exists = agentsData.some((a) => a.agent_id === prev);
          const next = exists ? prev : agentsData[0]?.agent_id ?? '';
          if (activeRole === 'agent' && next) updateMemberUrl('agent', next, 'replace');
          return next;
        });
        setSelectedWorkerId((prev) => {
          const exists = workersData.some((w) => w.worker_id === prev);
          return exists ? prev : workersData[0]?.worker_id ?? '';
        });
        setSelectedManagerId((prev) => {
          const exists = managersData.some((m) => m.manager_id === prev);
          return exists ? prev : managersData[0]?.manager_id ?? '';
        });

        setLoading(false);
      })
      .catch((err) => {
        console.error('API Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      if (activeRole === 'worker' && selectedWorkerId) updateMemberUrl('worker', selectedWorkerId, 'replace');
      if (activeRole === 'manager' && selectedManagerId) updateMemberUrl('manager', selectedManagerId, 'replace');
    }
  }, [activeRole, selectedWorkerId, selectedManagerId, loading]);

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = getInitialRoute();
      setActiveRole(nextRoute.role);
      if (nextRoute.role === 'agent') setSelectedAgentId(nextRoute.id);
      else if (nextRoute.role === 'worker') setSelectedWorkerId(nextRoute.id);
      else if (nextRoute.role === 'manager') setSelectedManagerId(nextRoute.id);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const roleOptions = [
    { role: 'agent', label: 'Agent' },
    { role: 'worker', label: 'Field Worker' },
    { role: 'manager', label: 'Manager' },
  ];

  const personSelectConfig = {
    agent: {
      label: 'Agent',
      value: selectedAgentId,
      emptyLabel: 'No agents',
      options: agents.map((a) => ({
        id: a.agent_id,
        label: `${a.business_name} (${a.agent_id})`,
      })),
      onChange: setSelectedAgentId,
    },
    worker: {
      label: 'Field Worker',
      value: selectedWorkerId,
      emptyLabel: 'No field workers',
      options: fieldWorkers.map((w) => ({
        id: w.worker_id,
        label: `${w.name} - ${w.provider_id}`,
      })),
      onChange: setSelectedWorkerId,
    },
    manager: {
      label: 'Manager',
      value: selectedManagerId,
      emptyLabel: 'No managers',
      options: managers.map((m) => ({
        id: m.manager_id,
        label: `${m.provider_id} - ${m.managed_region}`,
      })),
      onChange: setSelectedManagerId,
    },
  };

  const handleRoleChange = (nextRole) => {
    const nextConfig = personSelectConfig[nextRole];
    const nextId = nextConfig.value || nextConfig.options[0]?.id || '';
    setActiveRole(nextRole);

    if (nextId) {
      nextConfig.onChange(nextId);
      updateMemberUrl(nextRole, nextId);
    }
  };

  const renderRoleSelectors = () => {
    const activePersonConfig = personSelectConfig[activeRole];

    return (
      <div className="role-selectors" aria-label="Role directory">
        <div className="role-switcher" aria-label="Role switcher">
          <div className="role-switcher-label">
            <UsersRound size={16} />
            Role switcher
          </div>
          <div className="role-switcher-options">
            {roleOptions.map((option) => (
              <button
                key={option.role}
                type="button"
                className={activeRole === option.role ? 'active' : ''}
                onClick={() => handleRoleChange(option.role)}
                aria-pressed={activeRole === option.role}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="role-select current-person-select">
          <span>{activePersonConfig.label}</span>
          <select
            value={activePersonConfig.value}
            onChange={(e) => {
              if (!e.target.value) return;
              activePersonConfig.onChange(e.target.value);
              updateMemberUrl(activeRole, e.target.value);
            }}
          >
            {activePersonConfig.options.length === 0 && <option value="">{activePersonConfig.emptyLabel}</option>}
            {activePersonConfig.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  if (loading) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="header-left">
            <p className="eyebrow">SUST CSE Carnival 2026</p>
            <h1>Super Agent Liquidity &amp; Risk Intelligence</h1>
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
          <div className="header-left">
            <p className="eyebrow">SUST CSE Carnival 2026</p>
            <h1>Super Agent Liquidity &amp; Risk Intelligence</h1>
          </div>
        </header>
        <EmptyState message={`Failed to load data from the server: ${error}`} />
      </main>
    );
  }

  // Resolve which entity is active — no processing, just a lookup
  const activeAgent   = agents.find((a) => a.agent_id   === selectedAgentId)   ?? agents[0];
  const activeWorker  = fieldWorkers.find((w) => w.worker_id  === selectedWorkerId)  ?? fieldWorkers[0];
  const activeManager = managers.find((m) => m.manager_id === selectedManagerId) ?? managers[0];

  const roleCopy = {
    agent: {
      eyebrow: 'Agent console',
      title: activeAgent ? `${activeAgent.business_name} Liquidity View` : 'Agent Liquidity View',
    },
    worker: {
      eyebrow: 'Field worker console',
      title: activeWorker ? `${activeWorker.name} Field Operations` : 'Field Operations',
    },
    manager: {
      eyebrow: 'Manager console',
      title: activeManager ? `${activeManager.provider_id} Regional Oversight` : 'Regional Oversight',
    },
  };

  const renderActivePage = () => {
    if (activeRole === 'worker') {
      if (!activeWorker) return <EmptyState message="No field worker data available." />;
      return <WorkerPage agent={activeWorker} cases={cases} />;
    }

    if (activeRole === 'manager') {
      if (!activeManager) return <EmptyState message="No manager data available." />;
      return <ManagerPage agent={activeManager} />;
    }

    if (!activeAgent) return <EmptyState message="No agent data available." />;
    return <AgentPage agent={activeAgent} cases={cases} formatBDT={formatBDT} />;
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

      {renderActivePage()}
    </main>
  );
}

export default Dashboard;

