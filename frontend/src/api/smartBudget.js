/**
 * smartBudget.js — API calls for the Smart Budgeting v2 backend.
 */

const BASE = '/api/smart-budget';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const firstError = typeof err === 'object' 
      ? Object.values(err).flat().join(' ') 
      : `HTTP ${res.status}`;
    throw new Error(firstError);
  }
  return res.json();
}

/**
 * Fetch the complete Smart Budget state.
 * Automatically catches up missed weeks on the backend.
 */
export function getState() {
  return fetchJson(`${BASE}/state/`);
}

/**
 * Log a new expense.
 * 
 * @param {object} payload { amount, description, expense_date }
 */
export function logExpense(payload) {
  return fetchJson(`${BASE}/entries/`, {
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
  return fetchJson(`${BASE}/entries/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Delete an expense.
 * 
 * @param {number} id 
 */
export function deleteExpense(id) {
  return fetchJson(`${BASE}/entries/${id}/`, {
    method: 'DELETE',
  });
}

/**
 * Manually trigger week-end settlement.
 */
export function endWeek() {
  return fetchJson(`${BASE}/end-week/`, {
    method: 'POST',
  });
}

/**
 * Trigger month-end settlement checks.
 * Returns action needed (e.g. SURPLUS to allocate, DEFICIT to cover).
 */
export function settleMonth() {
  return fetchJson(`${BASE}/settle-month/`, {
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
  return fetchJson(`${BASE}/allocate-surplus/`, {
    method: 'POST',
    body: JSON.stringify({ destination, amount }),
  });
}
