/**
 * ChangePasswordPage.jsx — Mandatory first-login password change screen.
 *
 * Accessible only when:
 *   - A valid JWT exists (user is authenticated).
 *   - must_change_password === true.
 *
 * After a successful password change:
 *   - The backend sets must_change_password = false and returns a fresh JWT.
 *   - The user is redirected to /dashboard.
 *
 * The user cannot navigate away to protected routes until this is completed
 * (ProtectedRoute enforces this redirect on the frontend; the backend
 * enforces it by requiring a valid token for the change-password endpoint).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../api/auth';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

const MIN_LENGTH = 8;

function PasswordStrengthBar({ password }) {
  const score = getStrengthScore(password);
  const colors = ['', 'var(--danger)', 'var(--warning)', '#60A5FA', 'var(--success)'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  if (!password) return null;

  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '99px',
              background: i <= score ? colors[score] : 'rgba(255,255,255,0.08)',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.75rem', color: colors[score] || 'var(--muted)' }}>
        {labels[score]}
      </span>
    </div>
  );
}

function getStrengthScore(pw) {
  if (!pw || pw.length < MIN_LENGTH) return 1;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { loginUser, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate('/login', { replace: true });
      } else if (!user.must_change_password) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, authLoading, navigate]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading || !user) {
    return (
      <div className="login-wrapper">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" aria-label="Loading…" />
        </div>
      </div>
    );
  }

  // Client-side validation
  const validate = () => {
    if (newPassword.length < MIN_LENGTH) {
      return `Password must be at least ${MIN_LENGTH} characters.`;
    }
    if (/^\d+$/.test(newPassword)) {
      return 'Password cannot consist of digits only.';
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const data = await changePassword(newPassword, confirmPassword);
      loginUser(data); // updates must_change_password to false in context
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Header */}
        <div className="login-logo">
          <div
            className="login-logo-mark"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #FBBF24)' }}
          >
            🔐
          </div>
          <h1>Set Your Password</h1>
          <p>
            {user ? `Welcome, ${user.name}! ` : ''}
            Choose a secure password to continue.
          </p>
        </div>

        {/* Info banner */}
        <div
          style={{
            background: 'rgba(124,106,246,0.08)',
            border: '1px solid rgba(124,106,246,0.2)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '4px',
          }}
        >
          <p style={{ fontSize: '0.82rem', color: 'var(--accent-2)', lineHeight: 1.5 }}>
            This is a <strong>one-time step</strong> required before you can access the app.
            Your new password must be at least {MIN_LENGTH} characters.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="col" noValidate>
          {/* New password */}
          <div className="input-group">
            <label htmlFor="new-password">New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="new-password"
                name="new_password"
                type={showNew ? 'text' : 'password'}
                className="input"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                id="toggle-new-password"
                onClick={() => setShowNew(v => !v)}
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', cursor: 'pointer', color: 'var(--muted)',
                  fontSize: '1rem', padding: '0', lineHeight: 1,
                }}
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? '🙈' : '👁️'}
              </button>
            </div>
            <PasswordStrengthBar password={newPassword} />
          </div>

          {/* Confirm password */}
          <div className="input-group">
            <label htmlFor="confirm-password">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirm-password"
                name="confirm_password"
                type={showConfirm ? 'text' : 'password'}
                className="input"
                placeholder="Re-enter your password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                id="toggle-confirm-password"
                onClick={() => setShowConfirm(v => !v)}
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', cursor: 'pointer', color: 'var(--muted)',
                  fontSize: '1rem', padding: '0', lineHeight: 1,
                }}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
            {/* Real-time match indicator */}
            {confirmPassword && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: newPassword === confirmPassword ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <p
              id="change-password-error"
              role="alert"
              style={{
                color: 'var(--danger)',
                fontSize: '0.84rem',
                padding: '8px 12px',
                background: 'rgba(248,113,113,0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(248,113,113,0.2)',
              }}
            >
              {error}
            </p>
          )}

          <div style={{ marginTop: '4px' }}>
            <Button type="submit" full id="change-password-btn" disabled={loading}>
              {loading ? 'Saving…' : '→ Set Password & Continue'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
