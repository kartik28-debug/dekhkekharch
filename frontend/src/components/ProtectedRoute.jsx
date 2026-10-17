/**
 * ProtectedRoute.jsx — Wraps any route that requires authentication.
 *
 * Behaviour:
 *   1. While auth state is loading → show a full-screen spinner.
 *   2. Not logged in → redirect to /login.
 *   3. Logged in but must_change_password === true → redirect to /change-password.
 *   4. Otherwise → render the child route.
 *
 * The must_change_password check is also enforced on the backend; this
 * redirect is an additional UX guard, not the sole security control.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-wrapper">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" aria-label="Loading…" />
          <p className="text-muted" style={{ marginTop: 16 }}>Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}
