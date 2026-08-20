import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Card from '../components/Card';

const NAV_CARDS = [
  { id: 'smart-budgeting', icon: '📊', label: 'Smart Budgeting', sub: 'DSL · Weekly limits', path: '/smart-budgeting' },
  { id: 'major-expenses', icon: '🏠', label: 'Major Expenses', sub: 'EMI, Rent, Bills', path: '/major-expenses' },
  { id: 'emergency', icon: '🛡️', label: 'Emergency Fund', sub: 'Safety net', path: '/emergency' },
  { id: 'savings', icon: '💎', label: 'Savings', sub: 'Goals · Stocks', path: '/savings' },
];

const MODES = ['Focused', 'Balanced', 'Custom'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [salary, setSalary] = useState('75000');
  const [mode, setMode] = useState('Balanced');

  return (
    <>
      <NavBar showBack={false} />
      <div className="page">
        <div className="flex items-center justify-between mb-24">
          <div>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Good morning 👋</p>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Dashboard</h1>
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '0.9rem'
          }}>H</div>
        </div>

        {/* Salary */}
        <p className="section-label">Monthly Salary</p>
        <div className="salary-row mb-24">
          <span className="salary-prefix">₹</span>
          <input
            id="salary-input"
            className="salary-input"
            type="number"
            value={salary}
            onChange={e => setSalary(e.target.value)}
            placeholder="0"
          />
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>/mo</span>
        </div>

        {/* Mode */}
        <p className="section-label">Budget Mode</p>
        <div className="mode-selector mb-24">
          {MODES.map(m => (
            <button
              key={m}
              id={`mode-${m.toLowerCase()}`}
              className={`mode-btn ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'Focused' && '🎯 '}
              {m === 'Balanced' && '⚖️ '}
              {m === 'Custom' && '🛠 '}
              {m}
            </button>
          ))}
        </div>

        {/* Quick-stats */}
        <div className="grid-2 mb-24">
          <Card>
            <p className="section-label mb-8">Allocatable</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success)' }}>₹52,000</p>
            <p className="text-muted mt-4">after major expenses</p>
          </Card>
          <Card>
            <p className="section-label mb-8">Spent this week</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-3)' }}>₹4,320</p>
            <p className="text-muted mt-4">of ₹8,500 DSL</p>
          </Card>
        </div>

        {/* Nav cards */}
        <p className="section-label">Quick Access</p>
        <div className="grid-4">
          {NAV_CARDS.map(card => (
            <Card
              key={card.id}
              className="card-link"
              onClick={() => navigate(card.path)}
            >
              <div className="card-icon">{card.icon}</div>
              <div className="card-label">{card.label}</div>
              <div className="card-sub">{card.sub}</div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
