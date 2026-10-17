/**
 * LoginPage.jsx — Roll-number-based login screen.
 *
 * Replaces the old username/email/signup system.
 * Preserves the existing card layout, CSS variables, and component styles.
 *
 * Flow:
 *   1. Student enters roll number + password.
 *   2. Calls POST /api/auth/login.
 *   3. If must_change_password → navigate to /change-password.
 *   4. Otherwise → navigate to /dashboard.
 *
 * Error messages are generic — we never indicate whether a roll number exists.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginUser, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      if (user.must_change_password) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, authLoading, navigate]);

  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!rollNumber.trim()) {
      setError('Please enter your roll number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const data = await login(rollNumber.trim(), password);
      loginUser(data);

      if (data.must_change_password) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Invalid roll number or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-mark">💰</div>
          <h1>FinanceOS</h1>
          <p>Your personal finance command centre</p>
        </div>

        <form onSubmit={handleSubmit} className="col" noValidate>
          {/* Roll Number */}
          <div className="input-group">
            <label htmlFor="roll-number">Roll Number</label>
            <input
              id="roll-number"
              name="roll_number"
              className="input"
              placeholder="e.g. 24BCE0001"
              autoComplete="username"
              autoCapitalize="characters"
              value={rollNumber}
              onChange={e => setRollNumber(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                id="toggle-password-visibility"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  fontSize: '1rem',
                  padding: '0',
                  lineHeight: 1,
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p
              id="login-error"
              role="alert"
              style={{
                color: 'var(--danger)',
                fontSize: '0.84rem',
                marginTop: '-4px',
                padding: '8px 12px',
                background: 'rgba(248,113,113,0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(248,113,113,0.2)',
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <div style={{ marginTop: '4px' }}>
            <Button type="submit" full id="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : '→ Sign In'}
            </Button>
          </div>

          <p className="text-muted" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
            First login? Use your roll number as your password.
          </p>
        </form>
      </div>
    </div>
  );
}
