/**
 * goals.js — API calls for the Goals page.
 *
 * Endpoints:
 *   GET    /api/goals/       → list all user goals
 *   POST   /api/goals/       → create a new goal
 *   PUT    /api/goals/<id>/  → partial update a goal
 *   DELETE /api/goals/<id>/  → delete a goal
 */

import { apiFetch, apiFetchJson } from './client';

const BASE = '/api/goals';

/**
 * GET /api/goals/
 * Returns an array of Goal objects.
 */
export async function getGoals() {
  return apiFetchJson(`${BASE}/`);
}

/**
 * POST /api/goals/
 * Creates a new goal.
 *
 * @param {{ name: string, target_amount?: number, priority?: number, allocation_mode?: string, manual_amount?: number|null }} payload
 */
export async function createGoal(payload) {
  return apiFetchJson(`${BASE}/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PUT /api/goals/<id>/
 * Partial update — only send the fields you want to change.
 *
 * @param {number} id
 * @param {object} payload
 */
export async function updateGoal(id, payload) {
  return apiFetchJson(`${BASE}/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * DELETE /api/goals/<id>/
 * Returns nothing on success (204 No Content).
 *
 * @param {number} id
 */
export async function deleteGoal(id) {
  const res = await apiFetch(`${BASE}/${id}/`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
}
