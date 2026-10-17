import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NavBar({ title, showBack = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useAuth();

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/dashboard');
  };

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="navbar">
      {showBack && location.pathname !== '/dashboard' && (
        <button className="navbar-back" onClick={handleBack}>
          ← Back
        </button>
      )}
      <span className="navbar-brand">💰 FinanceOS</span>
      {title && (
        <>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>›</span>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{title}</span>
        </>
      )}
      <span className="navbar-spacer" />
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--muted)',
              fontWeight: 500,
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={`${user.name} (${user.roll_number})`}
          >
            {user.roll_number}
          </span>
          <button
            id="navbar-logout-btn"
            onClick={handleLogout}
            style={{
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.2)',
              color: 'var(--danger)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: '8px',
              transition: 'all 0.22s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.1)';
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
