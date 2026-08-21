import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Card from '../components/Card';
import { getDashboard, postSalary, lockMonth, unlockMonth } from '../api/dashboard';

const NAV_CARDS = [
  { id: 'smart-budgeting', icon: '📊', label: 'Smart Budgeting', sub: 'DSL · Weekly limits', path: '/smart-budgeting' },
  { id: 'major-expenses', icon: '🏠', label: 'Major Expenses', sub: 'EMI, Rent, Bills', path: '/major-expenses' },
  { id: 'emergency', icon: '🛡️', label: 'Buffer Reserve', sub: 'Safety net', path: '/emergency' },
  { id: 'savings', icon: '💎', label: 'Savings', sub: 'Goals · Stocks', path: '/savings' },
];

const MODES = [
  { key: 'focused', label: 'Focused', emoji: '🎯' },
  { key: 'balanced', label: 'Balanced', emoji: '⚖️' },
  { key: 'custom', label: 'Custom', emoji: '🛠' },
];

const PRESET_RATIOS = {
  focused: { major: '50.00', dsl: '15.00', savings: '25.00', emergency: '10.00' },
  balanced: { major: '50.00', dsl: '25.00', savings: '15.00', emergency: '10.00' },
};


/** Format a decimal string from the API as a human-readable INR string */
function fmt(val) {
  if (val === null || val === undefined) return '₹0';
  const n = parseFloat(val);
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** Skeleton shimmer block */
function Shimmer({ style }) {
  return (
    <div style={{
      background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--border) 50%, var(--bg-card) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: 8,
      ...style,
    }} />
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  // ── API state ──────────────────────────────────────────────────────────
  const [dashData, setDashData] = useState(null);  // raw API response
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // ── Local form state ───────────────────────────────────────────────────
  const [salaryInput, setSalaryInput] = useState('');
  const [mode, setMode] = useState('focused');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [appliedNote, setAppliedNote] = useState(null); // "applied to next month" banner

  // Custom ratio fields (only relevant when mode === 'custom')
  const [customRatios, setCustomRatios] = useState({
    major: '', dsl: '', savings: '', emergency: '',
  });

  // ── Fetch dashboard data ───────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data = await getDashboard();
      setDashData(data);
      // Sync form with latest API values so they stay consistent
      if (data.has_allocation) {
        setSalaryInput(parseFloat(data.salary).toFixed(0));
        setMode(data.mode || 'focused');
      }
      // Pre-fill custom ratios if the user has used them before
      if (data.last_custom_ratios) {
        const r = data.last_custom_ratios;
        setCustomRatios({
          major: parseFloat(r.major).toFixed(2),
          dsl: parseFloat(r.dsl).toFixed(2),
          savings: parseFloat(r.savings).toFixed(2),
          emergency: parseFloat(r.emergency).toFixed(2),
        });
      }
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // ── Submit salary ──────────────────────────────────────────────────────
  async function handleSalarySubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    setAppliedNote(null);

    const salaryNum = parseFloat(salaryInput);
    if (!salaryNum || salaryNum <= 0) {
      setSubmitError('Please enter a salary greater than ₹0.');
      return;
    }

    const payload = { salary: salaryNum, mode };
    if (mode === 'custom') {
      const r = customRatios;
      const sum = ['major', 'dsl', 'savings', 'emergency']
        .reduce((acc, k) => acc + (parseFloat(r[k]) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        setSubmitError(`Custom ratios must sum to 100%. Currently: ${sum.toFixed(2)}%.`);
        return;
      }
      payload.ratio_major = parseFloat(r.major);
      payload.ratio_dsl = parseFloat(r.dsl);
      payload.ratio_savings = parseFloat(r.savings);
      payload.ratio_emergency = parseFloat(r.emergency);
    }

    setSubmitting(true);
    try {
      const data = await postSalary(payload);
      setDashData(data);
      if (data.applied_to === 'next_month') {
        setAppliedNote('⏭ Current month is locked — changes will apply from next month.');
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Lock / Unlock month ──────────────────────────────────────────────────
  async function handleLock() {
    try {
      const data = await lockMonth();
      setDashData(data);
    } catch (err) {
      setSubmitError(err.message);
    }
  }

  async function handleUnlock() {
    try {
      const data = await unlockMonth();
      setDashData(data);
      setAppliedNote(null);
    } catch (err) {
      setSubmitError(err.message);
    }
  }


  // ── Derived display values ─────────────────────────────────────────────
  const buckets = dashData?.buckets ?? {};
  const isLocked = dashData?.is_locked ?? false;
  const hasSalary = dashData?.has_allocation ?? false;

  const dslBalance = buckets.dsl?.balance;
  const dslAlloc = buckets.dsl?.allocated;
  const savBalance = buckets.savings?.balance;
  const emergBal = buckets.buffer_reserve?.balance || 0;
  const majorBal = buckets.major?.balance;

  // "Allocatable" = everything except Major Expenses bucket
  const allocatable = hasSalary
    ? parseFloat(dslBalance || 0) + parseFloat(savBalance || 0) + parseFloat(emergBal || 0)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* shimmer keyframe + dashboard-specific styles */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .bucket-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; margin-bottom: 28px; }
        @media(min-width:600px){ .bucket-grid { grid-template-columns: repeat(4,1fr); } }
        .bucket-card {
          background: var(--bg-card);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius);
          padding: 18px 16px;
          backdrop-filter: blur(16px);
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }
        .bucket-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.5); border-color: rgba(124,106,246,0.3); }
        .bucket-card .b-label { font-size:.7rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.9px; margin-bottom:8px; font-family:'Space Grotesk',sans-serif; }
        .bucket-card .b-value { font-size:1.2rem; font-weight:800; font-family:'Space Grotesk',sans-serif; font-variant-numeric:tabular-nums; }
        .bucket-card .b-sub   { font-size:.74rem; color:var(--muted); margin-top:4px; }
        .apply-note { background: rgba(124,106,246,.1); border: 1px solid rgba(124,106,246,.35); border-radius: var(--radius-sm); padding: 11px 16px; font-size:.84rem; color: var(--accent-2); margin-bottom:16px; }
        .error-note { background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.35); border-radius: var(--radius-sm); padding: 11px 16px; font-size:.84rem; color: var(--danger); margin-bottom:16px; }
        .ratio-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-top:12px; }
        .ratio-grid label { font-size:.7rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; font-family:'Space Grotesk',sans-serif; }
        .ratio-grid input  { width:100%; margin-top:4px; }
      `}</style>

      <NavBar showBack={false} />
      <div className="page">

        {/* Header */}
        <div className="flex items-center justify-between mb-24">
          <div>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Good morning 👋</p>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Dashboard</h1>
          </div>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '1rem', fontFamily: 'Space Grotesk, sans-serif',
            boxShadow: '0 0 20px rgba(124,106,246,0.4)',
          }}>H</div>
        </div>

        {/* ── API error banner ── */}
        {apiError && (
          <div className="error-note" style={{ marginBottom: 24 }}>
            ⚠️ Could not reach the server: {apiError}
            <button
              onClick={fetchDashboard}
              style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
            >Retry</button>
          </div>
        )}

        {/* ── Salary form ── */}
        <form onSubmit={handleSalarySubmit}>
          <p className="section-label">Monthly Salary</p>
          <div className={`salary-row mb-${mode === 'custom' ? '8' : '16'}`}>
            <span className="salary-prefix">₹</span>
            {loading ? (
              <Shimmer style={{ flex: 1, height: 32 }} />
            ) : (
              <input
                id="salary-input"
                className="salary-input"
                type="number"
                min="1"
                value={salaryInput}
                onChange={e => setSalaryInput(e.target.value)}
                placeholder="0"
                disabled={isLocked}
              />
            )}
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>/mo</span>
          </div>

          {/* Mode selector */}
          <p className="section-label">Budget Mode</p>
          <div className="mode-selector mb-16">
            {MODES.map(m => (
              <button
                key={m.key}
                id={`mode-${m.key}`}
                type="button"
                className={`mode-btn ${mode === m.key ? 'active' : ''}`}
                onClick={() => setMode(m.key)}
                disabled={isLocked}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>

          {/* Custom ratio inputs */}
          {mode === 'custom' && !isLocked && (
            <div className="ratio-grid mb-16">
              {[
                { key: 'major', label: 'Major %' },
                { key: 'dsl', label: 'Wants %' },
                { key: 'savings', label: 'Savings %' },
                { key: 'emergency', label: 'Buffer %' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label htmlFor={`ratio-${key}`}>{label}</label>
                  <input
                    id={`ratio-${key}`}
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={customRatios[key]}
                    onChange={e => setCustomRatios(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Preset ratio display */}
          {mode !== 'custom' && (
            <div className="ratio-grid mb-16">
              {[
                { key: 'major', label: 'Major %' },
                { key: 'dsl', label: 'Wants %' },
                { key: 'savings', label: 'Savings %' },
                { key: 'emergency', label: 'Buffer %' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label>{label}</label>
                  <input
                    className="input"
                    type="text"
                    disabled
                    value={PRESET_RATIOS[mode][key]}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Validation / applied notes */}
          {submitError && <div className="error-note">{submitError}</div>}
          {appliedNote && <div className="apply-note">{appliedNote}</div>}

          {/* Submit / Lock row */}
          <div className="flex mb-24" style={{ gap: 10 }}>
            {!isLocked && (
              <button
                id="apply-salary-btn"
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={submitting || loading}
              >
                {submitting ? 'Saving…' : '✓ Apply'}
              </button>
            )}
            {hasSalary && !isLocked && (
              <button
                id="lock-month-btn"
                type="button"
                className="btn btn-secondary"
                onClick={handleLock}
                disabled={submitting}
              >
                🔒 Start Month
              </button>
            )}
            {isLocked && (
              <div className="flex items-center" style={{ flex: 1, gap: 10 }}>
                <div className="apply-note" style={{ flex: 1, margin: 0, textAlign: 'center' }}>
                  🔒 Month locked — changes apply from next month
                </div>
                <button
                  id="unlock-month-btn"
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleUnlock}
                  disabled={submitting}
                >
                  🔓 Unlock
                </button>
              </div>
            )}
          </div>
        </form>

        {/* ── Quick-stats row ── */}
        <div className="grid-2 mb-24">
          <Card>
            <p className="section-label mb-8">Allocatable</p>
            {loading ? (
              <Shimmer style={{ height: 28, width: '70%', marginBottom: 6 }} />
            ) : (
              <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(135deg, #4ADE80, #22C55E)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {hasSalary ? fmt(allocatable) : '₹0'}
              </p>
            )}
            <p className="text-muted mt-4">
              {hasSalary ? 'Monthly Wants + Savings + Buffer Reserve' : 'Set a salary to get started'}
            </p>
          </Card>
          <Card>
            <p className="section-label mb-8">Monthly Wants</p>
            {loading ? (
              <Shimmer style={{ height: 28, width: '60%', marginBottom: 6 }} />
            ) : (
              <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {hasSalary ? fmt(dslBalance) : '₹0'}
              </p>
            )}
            <p className="text-muted mt-4">
              {hasSalary ? `of ${fmt(dslAlloc)} allocated` : '—'}
            </p>
          </Card>
        </div>

        {/* ── 4-bucket breakdown ── */}
        <p className="section-label">Bucket Breakdown</p>
        <div className="bucket-grid">
          {[
            { key: 'major', label: 'Major Expenses', color: 'var(--accent)', icon: '🏠' },
            { key: 'dsl', label: 'Monthly Wants Budget', color: 'var(--accent-3)', icon: '📊' },
            { key: 'savings', label: 'Savings', color: 'var(--success)', icon: '💎' },
            { key: 'buffer_reserve', label: 'Buffer Reserve', color: 'var(--danger)', icon: '🛡️' },
          ].map(({ key, label, color, icon }) => {
            const bal = buckets[key]?.balance;
            const alloc = buckets[key]?.allocated;
            const pct = alloc && parseFloat(alloc) > 0
              ? Math.min(100, (parseFloat(bal) / parseFloat(alloc)) * 100)
              : 0;
            return (
              <div className="bucket-card" key={key}>
                <div className="b-label">{icon} {label}</div>
                {loading ? (
                  <Shimmer style={{ height: 22, width: '65%', marginBottom: 6 }} />
                ) : (
                  <div className="b-value" style={{ color }}>
                    {hasSalary ? fmt(bal) : '₹0'}
                  </div>
                )}
                <div className="b-sub">
                  {hasSalary ? `of ${fmt(alloc)}` : 'No allocation yet'}
                </div>
                {hasSalary && !loading && (
                  <div className="progress-bar-track" style={{ marginTop: 8 }}>
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Nav cards ── */}
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
