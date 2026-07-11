/**
 * API service helper for the Convergence Frontend.
 */

export async function fetchAgents() {
  const res = await fetch('/api/agents');
  if (!res.ok) {
    throw new Error(`Failed to fetch agents (status: ${res.status})`);
  }
  const data = await res.json();
  return data.agents || [];
}

export async function fetchCases() {
  const res = await fetch('/api/cases');
  if (!res.ok) {
    throw new Error(`Failed to fetch cases (status: ${res.status})`);
  }
  const data = await res.json();
  return data.cases || [];
}

export async function fetchFieldWorkers() {
  const res = await fetch('/api/field-workers');
  if (!res.ok) {
    throw new Error(`Failed to fetch field workers (status: ${res.status})`);
  }
  const data = await res.json();
  return data.field_workers || [];
}

export async function fetchManagers() {
  const res = await fetch('/api/managers');
  if (!res.ok) {
    throw new Error(`Failed to fetch managers (status: ${res.status})`);
  }
  const data = await res.json();
  return data.managers || [];
}
