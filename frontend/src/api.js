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
