/**
 * savings.js — API calls for the Savings page Goal/Stocks allocation.
 *
 * Endpoints:
 *   GET /api/savings/allocation/   → current goal_amount + stocks_amount for this month
 *   PUT /api/savings/allocation/   → persist the user's goal_amount choice
 */

const BASE = '/api/savings';

/**
 * GET /api/savings/allocation/
 * Returns { goal_amount: string, stocks_amount: string }
 * Both are Decimal strings from DRF (e.g. "2000.00").
 * goal_amount = 0 if not yet set for this month.
 */
export async function getSavingsAllocation() {
  const res = await fetch(`${BASE}/allocation/`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * PUT /api/savings/allocation/
 * Body: { goal_amount: number }
 * Returns { goal_amount: string, stocks_amount: string }
 *
 * @param {{ goal_amount: number }} payload
 */
export async function putSavingsAllocation(payload) {
  const res = await fetch(`${BASE}/allocation/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const firstError =
      typeof data === 'object'
        ? Object.values(data).flat().join(' ')
        : `HTTP ${res.status}`;
    throw new Error(firstError);
  }
  return data;
}
