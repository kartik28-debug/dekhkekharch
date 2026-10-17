/**
 * auth.js — API calls for the FastAPI auth service.
 *
 * All requests go to /api/auth/* which Vite proxies to the FastAPI server
 * on port 8001.  Tokens are stored in sessionStorage (cleared on tab close).
 *
 * Token storage key: "financeos_token"
 * Never store the token in a place accessible to other origins.
 */

const BASE = '/api/auth';
const TOKEN_KEY = 'financeos_token';

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Build Authorization header if a token is stored. */
export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Auth API calls ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * @param {string} rollNumber
 * @param {string} password
 * @returns {Promise<{access_token, must_change_password, roll_number, name}>}
 */
export async function login(rollNumber, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_number: rollNumber, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `Login failed (${res.status})`);
  }

  saveToken(data.access_token);
  return data;
}

/**
 * POST /api/auth/change-password
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise<{access_token, must_change_password, roll_number, name}>}
 */
export async function changePassword(newPassword, confirmPassword) {
  const res = await fetch(`${BASE}/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ new_password: newPassword, confirm_password: confirmPassword }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Pydantic validation errors come as an array under 'detail'
    const msg = Array.isArray(data.detail)
      ? data.detail.map(e => e.msg).join(' ')
      : data.detail || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  saveToken(data.access_token);
  return data;
}

/**
 * GET /api/auth/me — fetch current student profile.
 * Returns null if not authenticated.
 */
export async function getMe() {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${BASE}/me`, {
    headers: authHeaders(),
  });

  if (res.status === 401) {
    clearToken();
    return null;
  }

  if (!res.ok) return null;
  return res.json();
}

/**
 * POST /api/auth/logout
 */
export async function logout() {
  try {
    await fetch(`${BASE}/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {
    // Network error — still clear token locally
  } finally {
    clearToken();
  }
}
