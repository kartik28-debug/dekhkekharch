/**
 * savings.js — API calls for the Savings page Goal/Stocks allocation.
 *
 * Endpoints:
 *   GET /api/savings/allocation/   → current goal_amount + stocks_amount for this month
 *   PUT /api/savings/allocation/   → persist the user's goal_amount choice
 */

import { apiFetchJson } from './client';

const BASE = '/api/savings';

/**
 * GET /api/savings/allocation/
 * Returns { goal_amount: string, stocks_amount: string }
 * Both are Decimal strings from DRF (e.g. "2000.00").
 * goal_amount = 0 if not yet set for this month.
 */
export async function getSavingsAllocation() {
  return apiFetchJson(`${BASE}/allocation/`);
}

/**
 * PUT /api/savings/allocation/
 * Body: { goal_amount: number }
 * Returns { goal_amount: string, stocks_amount: string }
 *
 * @param {{ goal_amount: number }} payload
 */
export async function putSavingsAllocation(payload) {
  return apiFetchJson(`${BASE}/allocation/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
