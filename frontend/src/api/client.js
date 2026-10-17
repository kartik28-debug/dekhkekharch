/**
 * client.js — Centralized HTTP client for Django and FastAPI endpoints.
 *
 * Automatically:
 *   - Attaches `Authorization: Bearer <token>` header from sessionStorage.
 *   - Sets `Content-Type: application/json` when a JSON body is provided.
 *   - Intercepts 401 Unauthorized (expired/missing token) → clears token and redirects to /login.
 *   - Intercepts 403 Forbidden with `must_change_password` → redirects to /change-password.
 *   - Unwraps errors cleanly.
 */

import { authHeaders, clearToken } from './auth';

export async function apiFetch(url, options = {}) {
  const headers = {
    ...authHeaders(),
    ...(options.headers || {}),
  };

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Session expired. Please log in again.');
  }

  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    if (err.must_change_password && typeof window !== 'undefined') {
      window.location.href = '/change-password';
    }
    throw new Error(err.detail || 'Access denied.');
  }

  return res;
}

export async function apiFetchJson(url, options = {}) {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message =
      typeof data === 'object' && data !== null
        ? data.detail || Object.values(data).flat().join(' ')
        : `HTTP ${res.status}`;
    throw new Error(message || `HTTP ${res.status}`);
  }
  return res.json();
}
