import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Card from '../components/Card';

const SAVINGS_BALANCE = 42300;

export default function SavingsPage() {
  const navigate = useNavigate();

  return (
    <>
      <NavBar title="Savings" />
      <div className="page">
        <h1 className="page-title">Savings</h1>

        {/* Balance */}
        <div className="balance-box mb-24">
          <p className="balance-label">Savings Balance</p>
          <p className="balance-amount purple">₹{SAVINGS_BALANCE.toLocaleString()}</p>
          <p className="text-muted mt-8" style={{ fontSize: '0.8rem' }}>+₹3,200 this month</p>
        </div>

        {/* Quick stats */}
        <div className="grid-2 mb-24">
          <div className="card">
            <p className="section-label mb-8">Monthly Contribution</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)' }}>₹8,000</p>
          </div>
          <div className="card">
            <p className="section-label mb-8">Goal Progress</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-2)' }}>68%</p>
            <div className="progress-bar-track mt-8">
              <div className="progress-bar-fill" style={{ width: '68%' }} />
            </div>
          </div>
        </div>

        {/* Option cards */}
        <p className="section-label">Where to invest?</p>
        <div className="grid-2">
          <Card className="card-link" onClick={() => navigate('/goals')}>
            <div className="card-icon">🎯</div>
            <div className="card-label">Goal Engine</div>
            <div className="card-sub">FIFO goal allocation</div>
          </Card>
          <Card className="card-link" onClick={() => navigate('/stocks')}>
            <div className="card-icon">📈</div>
            <div className="card-label">Stocks</div>
            <div className="card-sub">Market portfolio</div>
          </Card>
        </div>
      </div>
    </>
  );
}
