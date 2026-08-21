import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ListItem from '../components/ListItem';
import { 
  getState, 
  logExpense, 
  editExpense, 
  deleteExpense, 
  endWeek, 
  settleMonth, 
  allocateSurplus 
} from '../api/smartBudget';
import { getBufferReserve } from '../api/bufferReserve';
import { 
  toISODate, 
  isDateInSettledWeek, 
  isWeekEnded 
} from '../lib/weeklyCheckpoint';

export default function SmartBudgetingPage() {
  const navigate = useNavigate();
  const [sbState, setSbState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [efBalance, setEfBalance] = useState(0);

  // Form states
  const [form, setForm] = useState({ amount: '', description: '', date: toISODate(new Date()) });
  const [editingId, setEditingId] = useState(null);
  const [logging, setLogging] = useState(false);

  // Modal / UI states
  const [modalMode, setModalMode] = useState(null); // 'end_week', 'allocate_surplus', 'outstanding_deficit'
  const [settlementResult, setSettlementResult] = useState(null);
  const [surplusDest, setSurplusDest] = useState('savings');

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getState();
      setSbState(data);
      
      const efStatus = await getBufferReserve();
      setEfBalance(parseFloat(efStatus.balance) || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle auto week-end trigger
  useEffect(() => {
    if (sbState && !sbState.is_month_settled && !sbState.is_exhausted) {
      const today = toISODate(new Date());
      if (isWeekEnded(sbState.week_start_date, today) && !modalMode) {
        setModalMode('end_week');
      }
    }
  }, [sbState, modalMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sbState) return;

    try {
      setLogging(true);
      const payload = {
        amount: parseFloat(form.amount),
        description: form.description.trim(),
        expense_date: form.date,
      };

      let newState;
      if (editingId) {
        newState = await editExpense(editingId, payload);
      } else {
        newState = await logExpense(payload);
      }
      
      setSbState(newState);
      setForm({ amount: '', description: '', date: toISODate(new Date()) });
      setEditingId(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLogging(false);
    }
  };

  const handleEditInit = (entry) => {
    setEditingId(entry.id);
    setForm({
      amount: entry.amount,
      description: entry.description,
      date: entry.expense_date,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      setLogging(true);
      const newState = await deleteExpense(id);
      setSbState(newState);
    } catch (err) {
      alert(err.message);
    } finally {
      setLogging(false);
    }
  };

  const handleEndWeek = async () => {
    if (!sbState) return;
    try {
      setLogging(true);
      
      // Edge Case 2: divide by zero guard
      if (sbState.remaining_weeks <= 0) {
        // Route straight to month-end
        const result = await settleMonth();
        setSettlementResult(result);
        if (result.action_needed === 'ALLOCATE') {
          setModalMode('allocate_surplus');
        } else if (result.action_needed === 'PARTIAL_EF') {
          setModalMode('outstanding_deficit');
        } else {
          setModalMode(null);
          fetchData(); // refresh full state
        }
        return;
      }

      // Normal week-end
      const newState = await endWeek();
      setSbState(newState);
      setModalMode(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLogging(false);
    }
  };

  const handleAllocateSurplus = async () => {
    if (!settlementResult) return;
    try {
      setLogging(true);
      const newState = await allocateSurplus(surplusDest, settlementResult.amount);
      setSbState(newState);
      setModalMode(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLogging(false);
    }
  };

  if (loading) {
    return (
      <div className="layout">
        <NavBar title="Smart Budgeting" />
        <div className="page col flex-center" style={{ marginTop: 100 }}>
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !sbState) {
    return (
      <div className="layout">
        <NavBar title="Smart Budgeting" />
        <div className="page col flex-center" style={{ marginTop: 100 }}>
          <p className="text-danger text-center">
            {error || 'No active budget found.'}<br/>
            Set your salary on the Dashboard first.
          </p>
          <Button className="mt-16" onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const dslVal = parseFloat(sbState.dsl_display);
  const wslVal = parseFloat(sbState.wsl_display);
  const spent = parseFloat(sbState.weekly_expense);
  const pool = parseFloat(sbState.smart_budget_expense);

  // Percentage for progress bar
  const pct = wslVal > 0 ? Math.round((spent / wslVal) * 100) : (spent > 0 ? 100 : 0);
  const glowClass = pct >= 90 ? 'danger' : pct >= 65 ? 'warn' : '';

  return (
    <div className="layout">
      <style>{`
        .chk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .chk-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; }
        .chk-label { color: var(--muted); font-size: 0.8rem; }
        .chk-val { font-weight: 600; font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; margin-top: 4px; }
      `}</style>

      <NavBar title="Smart Budgeting" />
      <div className="page">
        <h1 className="page-title" style={{ textAlign: 'center' }}>Smart Budgeting</h1>
        
        {/* Edge Case 6: Catch-up banner */}
        {sbState.catch_up_summaries && sbState.catch_up_summaries.length > 0 && (
          <div style={{ background: 'rgba(74, 222, 128, 0.1)', color: '#4ADE80', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
            <strong>Past weeks caught up!</strong> Processed {sbState.catch_up_summaries.length} missed week(s).
          </div>
        )}

        {/* Hero Card */}
        <div className="card text-center" style={{ position: 'relative' }}>
          <div className="flex-center col">
            <div className={`dsl-ring ${glowClass}`}>
              <span className="dsl-label">Daily Limit (DSL)</span>
              <span className="dsl-amount">₹{dslVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          
          <p className="dsl-sub" style={{ marginTop: 8 }}>
            Weekly Limit (WSL): ₹{wslVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>

          <div className="progress-bar-track" style={{ marginTop: 12, maxWidth: 280, margin: '12px auto 0' }}>
            <div className="progress-bar-fill" style={{
              width: `${Math.min(pct, 100)}%`,
              background: pct >= 90 ? 'linear-gradient(90deg, #EF4444, #F87171)'
                : pct >= 65 ? 'linear-gradient(90deg, #D97706, #FBBF24)'
                : 'linear-gradient(90deg, var(--accent), var(--accent-2))'
            }} />
          </div>
          <p className="text-center text-muted mt-8" style={{ fontSize: '0.75rem' }}>
            Spent this week: ₹{spent.toLocaleString('en-IN')} / ₹{wslVal.toLocaleString('en-IN')} ({pct}%)
          </p>

          <div className="chk-grid">
            <div className="chk-card">
              <span className="chk-label">Smart Budget Pool</span>
              <span className={`chk-val ${pool < 0 ? 'text-danger' : ''}`}>₹{pool.toLocaleString('en-IN')}</span>
            </div>
            <div className="chk-card">
              <span className="chk-label">Month's Surplus</span>
              <span className="chk-val">₹{parseFloat(sbState.monthly_expense).toLocaleString('en-IN')}</span>
            </div>
            <div className="chk-card">
              <span className="chk-label">Week Number</span>
              <span className="chk-val">{sbState.week_number} / 4+</span>
            </div>
            <div className="chk-card">
              <span className="chk-label">Remaining Days</span>
              <span className="chk-val">{sbState.remaining_days}</span>
            </div>
          </div>
          
          {parseFloat(sbState.outstanding_deficit) > 0 && (
            <div style={{ background: 'rgba(248,113,113,.1)', color: 'var(--danger)', padding: '6px 10px', borderRadius: 4, margin: '12px auto 0', fontSize: '0.8rem', fontWeight: 600, display: 'inline-block' }}>
              ⚠️ Outstanding Deficit Carried Forward: ₹{parseFloat(sbState.outstanding_deficit).toLocaleString('en-IN')}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="card mt-16">
          <h3 className="section-title">{editingId ? 'Edit Expense' : 'Log Expense'}</h3>
          {sbState.is_exhausted && (
             <p className="text-danger mb-16" style={{ fontSize: '0.8rem' }}>⚠️ Your budget is completely exhausted for this month.</p>
          )}
          {sbState.is_month_settled && (
             <p className="text-danger mb-16" style={{ fontSize: '0.8rem' }}>⚠️ This month is settled. You cannot log new expenses.</p>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="input-group">
                <label>Amount (₹)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
              <div className="input-group">
                <label>Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  max={toISODate(new Date())}
                  required
                />
              </div>
            </div>
            <div className="input-group mt-12">
              <label>Description (Optional)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Zomato, Groceries"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="row mt-16" style={{ gap: 8 }}>
              <Button type="submit" full disabled={logging || sbState.is_exhausted || sbState.is_month_settled}>
                {editingId ? 'Update Expense' : 'Add Expense'}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={() => {
                  setEditingId(null);
                  setForm({ amount: '', description: '', date: toISODate(new Date()) });
                }}>Cancel</Button>
              )}
            </div>
          </form>
        </div>

        {/* Transactions List */}
        <div className="card mt-16" style={{ marginBottom: 120 }}>
          <div className="row row-between mb-16">
            <h3 className="section-title" style={{ margin: 0 }}>Transaction History</h3>
            {!sbState.is_month_settled && (
              <Button size="sm" variant="secondary" onClick={() => setModalMode('end_week')}>
                End Week Now
              </Button>
            )}
          </div>

          <div className="list-group">
            {sbState.entries.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>No expenses logged this month.</p>
            ) : (
              sbState.entries.map((entry) => {
                const isSettled = isDateInSettledWeek(entry.expense_date, sbState.week_statuses);
                return (
                  <ListItem 
                    key={entry.id}
                    title={entry.description || 'Smart Budget Expense'}
                    subtitle={`${entry.expense_date} ${isSettled ? '• ⚠️ PAST WEEK' : ''}`}
                    extra={<span style={{ fontWeight: 600, color: 'var(--text)' }}>-₹{parseFloat(entry.amount).toLocaleString('en-IN')}</span>}
                    onEdit={sbState.is_month_settled ? null : () => handleEditInit(entry)}
                    onDelete={sbState.is_month_settled ? null : () => handleDelete(entry.id)}
                  />
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* ── Modals ── */}
      
      {/* End Week Confirmation */}
      <Modal open={modalMode === 'end_week'} onClose={() => setModalMode(null)} title="End Week?">
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 20 }}>
          Are you sure you want to trigger week-end settlement? This will lock in your weekly 
          spending, deduct your WSL (₹{wslVal.toLocaleString('en-IN')}) from the main pool, 
          and recalculate limits for the remaining {sbState.remaining_weeks - 1} week(s).
        </p>
        <Button full onClick={handleEndWeek} disabled={logging}>Confirm & Calculate</Button>
      </Modal>

      {/* Allocate Surplus */}
      <Modal open={modalMode === 'allocate_surplus'} onClose={() => setModalMode(null)} title="Month Complete!">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: '3rem' }}>🎉</span>
          <p style={{ marginTop: 10, fontWeight: 600 }}>You finished the month with a surplus of</p>
          <h2 style={{ color: 'var(--success)' }}>₹{parseFloat(settlementResult?.amount || 0).toLocaleString('en-IN')}</h2>
        </div>
        <p className="text-muted mb-16" style={{ fontSize: '0.9rem' }}>Where would you like to transfer this surplus?</p>
        <select className="input mb-16" value={surplusDest} onChange={(e) => setSurplusDest(e.target.value)}>
          <option value="savings">Savings Bucket</option>
          <option value="buffer_reserve">Buffer Reserve (Emergency)</option>
        </select>
        <Button full onClick={handleAllocateSurplus} disabled={logging}>Transfer & Complete Month</Button>
      </Modal>

      {/* Outstanding Deficit */}
      <Modal open={modalMode === 'outstanding_deficit'} onClose={() => setModalMode(null)} title="Month Complete (Deficit)">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: '3rem' }}>⚠️</span>
          <p style={{ marginTop: 10, fontWeight: 600 }}>You finished with a deficit of ₹{parseFloat(settlementResult?.amount || 0).toLocaleString('en-IN')}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
            Your Buffer Reserve (₹{efBalance.toLocaleString('en-IN')}) did not have enough to fully cover this.
          </p>
        </div>
        <div style={{ background: 'rgba(248,113,113,.1)', color: 'var(--danger)', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: 20 }}>
          The remaining deficit of <strong>₹{parseFloat(settlementResult?.remaining_deficit || 0).toLocaleString('en-IN')}</strong> will 
          be carried forward and deducted from next month's salary.
        </div>
        <Button full variant="secondary" onClick={() => {
          setModalMode(null);
          fetchData();
        }}>Acknowledge & Complete Month</Button>
      </Modal>
    </div>
  );
}
