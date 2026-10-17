/**
 * smartBudget.js — API calls for the Smart Budgeting v2 backend.
 */

import { apiFetch, apiFetchJson } from './client';

const BASE = '/api/smart-budget';

/**
 * Fetch the complete Smart Budget state.
 * Automatically catches up missed weeks on the backend.
 */
export function getState() {
  return apiFetchJson(`${BASE}/state/`);
}

/**
 * Log a new expense.
 * 
 * @param {object} payload { amount, description, expense_date }
 */
export function logExpense(payload) {
  return apiFetchJson(`${BASE}/entries/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Edit an existing expense.
 * 
 * @param {number} id
 * @param {object} payload { amount, description, expense_date }
 */
export function editExpense(id, payload) {
  return apiFetchJson(`${BASE}/entries/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Delete an expense.
 * 
 * @param {number} id 
 */
export async function deleteExpense(id) {
  const res = await apiFetch(`${BASE}/entries/${id}/`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}

/**
 * Manually trigger week-end settlement.
 */
export function endWeek() {
  return apiFetchJson(`${BASE}/end-week/`, {
    method: 'POST',
  });
}

/**
 * Trigger month-end settlement checks.
 * Returns action needed (e.g. SURPLUS to allocate, DEFICIT to cover).
 */
export function settleMonth() {
  return apiFetchJson(`${BASE}/settle-month/`, {
    method: 'POST',
  });
}

/**
 * Transfer month-end surplus.
 * 
 * @param {string} destination "savings" or "buffer_reserve"
 * @param {number} amount 
 */
export function allocateSurplus(destination, amount) {
  return apiFetchJson(`${BASE}/allocate-surplus/`, {
    method: 'POST',
    body: JSON.stringify({ destination, amount }),
  });
}
