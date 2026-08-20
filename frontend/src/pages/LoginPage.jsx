import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';

export default function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('signin');
  const [form, setForm] = useState({ name: '', contact: '', username: '', password: '' });

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = e => {
    e.preventDefault();
    navigate('/dashboard');
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

        {/* Tab toggle */}
        <div className="tabs mb-24">
          <button
            id="tab-signin"
            className={`tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => setTab('signin')}
          >
            Sign In
          </button>
          <button
            id="tab-signup"
            className={`tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => setTab('signup')}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="col">
          {tab === 'signup' && (
            <div className="input-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                name="name"
                className="input"
                placeholder="Harsh Vardhan"
                value={form.name}
                onChange={handleChange}
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="contact">{tab === 'signup' ? 'Phone / Email' : 'Email'}</label>
            <input
              id="contact"
              name="contact"
              className="input"
              placeholder={tab === 'signup' ? '+91 9876543210 or you@mail.com' : 'you@mail.com'}
              value={form.contact}
              onChange={handleChange}
            />
          </div>

          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              className="input"
              placeholder="@harshv"
              value={form.username}
              onChange={handleChange}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <Button type="submit" full id="login-btn">
              {tab === 'signin' ? '→ Sign In' : '→ Create Account'}
            </Button>
          </div>

          {tab === 'signin' && (
            <p className="text-muted" style={{ textAlign: 'center', marginTop: '8px' }}>
              No account?{' '}
              <span
                id="switch-to-signup"
                style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setTab('signup')}
              >
                Sign up
              </span>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
