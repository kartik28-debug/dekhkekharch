import { useNavigate, useLocation } from 'react-router-dom';

export default function NavBar({ title, showBack = true }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/dashboard');
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
    </nav>
  );
}
