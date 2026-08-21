/**
 * dashboard.js — API calls for the Dashboard page.
 *
 * All requests go through the Vite dev proxy: /api/* → http://127.0.0.1:8000
 * No auth headers needed for the current dev/demo phase.
 */

const BASE = '/api/dashboard';

/** GET /api/dashboard/ — fetch current allocation + bucket balances */
export async function getDashboard() {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * POST /api/dashboard/salary/ — set/update salary and mode.
 *
 * @param {object} payload
 * @param {string|number} payload.salary
 * @param {'focused'|'balanced'|'custom'} payload.mode
 * @param {number|null} [payload.ratio_major]
 * @param {number|null} [payload.ratio_dsl]
 * @param {number|null} [payload.ratio_savings]
 * @param {number|null} [payload.ratio_emergency]
 */
export async function postSalary(payload) {
  const res = await fetch(`${BASE}/salary/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface the first validation message from DRF
    const firstError =
      typeof data === 'object'
        ? Object.values(data).flat().join(' ')
        : `HTTP ${res.status}`;
    throw new Error(firstError);
  }
  return data;
}

/** POST /api/dashboard/lock/ — lock the current month ('Start Month') */
export async function lockMonth() {
  const res = await fetch(`${BASE}/lock/`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

/** POST /api/dashboard/unlock/ — unlock the current month */
export async function unlockMonth() {
  const res = await fetch(`${BASE}/unlock/`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

