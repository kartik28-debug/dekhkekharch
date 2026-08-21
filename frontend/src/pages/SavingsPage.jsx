import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { getDashboard } from '../api/dashboard';
import { getSavingsAllocation, putSavingsAllocation } from '../api/savings';

/* ── tiny shimmer helper ── */
function Shimmer({ style }) {
  return (
    <div style={{
      background: 'linear-gradient(90deg,var(--bg-card) 25%,var(--border) 50%,var(--bg-card) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: 8,
      ...style,
    }} />
  );
}

export default function SavingsPage() {
  const navigate = useNavigate();

  /* ── remote state ── */
  const [savingsBalance, setSavingsBalance] = useState(null); // from GET /api/dashboard/
  const [goalInput, setGoalInput]           = useState('');   // controlled input
  const [loading, setLoading]               = useState(true);
  const [apiError, setApiError]             = useState(null);
  const [saving, setSaving]                 = useState(false);
  const [saveError, setSaveError]           = useState(null);

  /* ── load: savings balance + persisted allocation ── */
  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [dash, alloc] = await Promise.all([
        getDashboard(),
        getSavingsAllocation(),
      ]);

      const bal = parseFloat(dash?.buckets?.savings?.balance ?? 0);
      setSavingsBalance(bal);

      // Pre-fill the goal input with the persisted value (if non-zero)
      const persisted = parseFloat(alloc?.goal_amount ?? 0);
      if (persisted > 0) {
        setGoalInput(String(persisted));
      }
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── derived values ── */
  const total       = savingsBalance ?? 0;
  const goalAmount  = Math.min(Math.max(parseFloat(goalInput) || 0, 0), total);
  const stockAmount = Math.max(total - goalAmount, 0);

  const handleGoalInput = e => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) setGoalInput(val);
  };

  /* ── persist allocation then navigate ── */
  const goToGoals = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await putSavingsAllocation({ goal_amount: goalAmount });
      navigate('/goals', { state: { goalAmount, savingsBalance: total } });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .sav-error { background: rgba(255,95,95,.1); border: 1px solid var(--danger);
          border-radius: 10px; padding: 10px 14px; font-size:.83rem; color: var(--danger); margin-bottom:16px; }
      `}</style>

      <NavBar title="Savings" />
      <div className="page">
        <h1 className="page-title" style={{ textAlign: 'center' }}>Savings</h1>

        {/* ── API error ── */}
        {apiError && (
          <div className="sav-error">
            ⚠️ {apiError}
            <button
              onClick={load}
              style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
            >Retry</button>
          </div>
        )}

        {/* ── Total Saving Amount ── */}
        <div className="balance-box mb-24">
          <p className="balance-label">Total Saving Amount</p>
          {loading ? (
            <Shimmer style={{ height: 48, width: '50%', margin: '0 auto 8px' }} />
          ) : (
            <p className="balance-amount purple">
              ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          )}
          <p className="text-muted mt-8" style={{ fontSize: '0.78rem' }}>
            Live from Savings bucket · Links to DSL &amp; Emergency Fund coming soon
          </p>
        </div>

        {/* ── Vertical split: Goal | Stocks ── */}
        <div style={styles.split}>

          {/* ── Left: Goal ── */}
          <div style={styles.panel} className="card">
            <p className="section-label mb-8">🎯 Goal Allocation</p>

            <div className="input-group mb-16">
              <label>Amount to allocate to Goals (₹)</label>
              <div style={styles.amtRow}>
                <span style={styles.prefix}>₹</span>
                <input
                  id="goal-amount-input"
                  type="text"
                  inputMode="decimal"
                  className="input"
                  placeholder="0"
                  value={goalInput}
                  onChange={handleGoalInput}
                  disabled={loading || savingsBalance === null}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div style={styles.allocBadge('#7C6AF6')}>
              <span style={styles.badgeLabel}>Goal Amount</span>
              {loading ? (
                <Shimmer style={{ height: 32, width: 100, marginTop: 4 }} />
              ) : (
                <span style={{ ...styles.badgeValue, background: 'linear-gradient(135deg, #7C6AF6, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  ₹{goalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>

            {saveError && (
              <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 8 }}>{saveError}</p>
            )}

            <button
              id="go-to-goals-btn"
              className="btn btn-primary btn-full"
              style={{ marginTop: 20 }}
              onClick={goToGoals}
              disabled={goalAmount <= 0 || loading || saving}
            >
              {saving ? 'Saving…' : 'Go to Goals →'}
            </button>
          </div>

          {/* ── Right: Stocks ── */}
          <div style={styles.panel} className="card">
            <p className="section-label mb-8">📈 Stocks Allocation</p>

            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 16 }}>
              Leftover amount after Goal allocation is automatically assigned here.
            </p>

            <div style={styles.allocBadge('#4ADE80')}>
              <span style={styles.badgeLabel}>Stocks Amount</span>
              {loading ? (
                <Shimmer style={{ height: 32, width: 100, marginTop: 4 }} />
              ) : (
                <span style={{ ...styles.badgeValue, background: 'linear-gradient(135deg, #16A34A, #4ADE80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  ₹{stockAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>

            <button
              id="go-to-stocks-btn"
              className="btn btn-accent2 btn-full"
              style={{ marginTop: 20 }}
              onClick={() => navigate('/stocks')}
            >
              Stocks (Coming Soon) →
            </button>
          </div>
        </div>

        {/* ── Allocation breakdown bar ── */}
        {!loading && total > 0 && (
          <div className="card mt-24">
            <p className="section-label mb-8">Allocation Breakdown</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6, color: 'var(--muted)' }}>
              <span>Goal {Math.round((goalAmount / total) * 100)}%</span>
              <span>Stocks {Math.round((stockAmount / total) * 100)}%</span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${(goalAmount / total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Inline styles ─────────────────────────────────────── */
const styles = {
  split: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
  },
  amtRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  prefix: {
    fontSize: '1.1rem',
    color: 'var(--muted)',
    fontWeight: 600,
  },
  allocBadge: color => ({
    background: `${color}18`,
    border: `1px solid ${color}55`,
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  }),
  badgeLabel: {
    fontSize: '0.72rem',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  badgeValue: {
    fontSize: '1.7rem',
    fontWeight: 800,
    fontFamily: 'Space Grotesk, sans-serif',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--accent)',
  },
};
