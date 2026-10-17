/**
 * dashboard.js — API calls for the Dashboard page.
 *
 * All requests route via Vite proxy: /api/* → http://127.0.0.1:8000
 * Authenticated via Bearer token issued by FastAPI.
 */

import { apiFetchJson } from './client';

const BASE = '/api/dashboard';

/** GET /api/dashboard/ — fetch current allocation + bucket balances */
export async function getDashboard() {
  return apiFetchJson(`${BASE}/`);
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
  return apiFetchJson(`${BASE}/salary/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** POST /api/dashboard/lock/ — lock the current month ('Start Month') */
export async function lockMonth() {
  return apiFetchJson(`${BASE}/lock/`, { method: 'POST' });
}

/** POST /api/dashboard/unlock/ — unlock the current month */
export async function unlockMonth() {
  return apiFetchJson(`${BASE}/unlock/`, { method: 'POST' });
}
