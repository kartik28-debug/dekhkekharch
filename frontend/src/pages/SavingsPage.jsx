import { useState, useEffect, useCallback } from 'react';
import NavBar from '../components/NavBar';
import { getDashboard } from '../api/dashboard';
import { getSavingsAllocation, putSavingsAllocation } from '../api/savings';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/goals';

export default function SavingsPage() {
  // ── Remote & Local State ────────────────────────────────────────────────
  const [totalSavings, setTotalSavings] = useState(0);
  const [goalRatioPercent, setGoalRatioPercent] = useState(70); // Default 70% Goals / 30% Stocks
  const [goals, setGoals] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [savingRatio, setSavingRatio] = useState(false);

  // Add Goal Form State
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [creatingGoal, setCreatingGoal] = useState(false);
  const [goalFormError, setGoalFormError] = useState(null);

  // Funding Input State per Goal: { [goalId]: amountString }
  const [fundingInputs, setFundingInputs] = useState({});
  const [fundingActiveId, setFundingActiveId] = useState(null);

  // ── Initial Data Load ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [dashData, allocData, goalsData] = await Promise.all([
        getDashboard().catch(() => ({})),
        getSavingsAllocation().catch(() => ({})),
        getGoals().catch(() => []),
      ]);

      // Total Savings from Dashboard Bucket balance
      const rawSavings = parseFloat(dashData?.buckets?.savings?.balance ?? 30000);
      const savingsVal = isNaN(rawSavings) ? 30000 : rawSavings;
      setTotalSavings(savingsVal);

      // Pre-fill Goal vs Stocks Ratio
      const persistedGoalAmt = parseFloat(allocData?.goal_amount ?? 0);
      if (savingsVal > 0 && persistedGoalAmt > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((persistedGoalAmt / savingsVal) * 100)));
        setGoalRatioPercent(pct);
      }

      setGoals(goalsData);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived Split Amounts ───────────────────────────────────────────────
  const goalAllocationAmount = Math.round((totalSavings * goalRatioPercent) / 100);
  const stocksAllocationAmount = totalSavings - goalAllocationAmount;

  // ── Handle Ratio Slider Change ──────────────────────────────────────────
  const handleRatioChange = async (newPercent) => {
    setGoalRatioPercent(newPercent);
    const newGoalAmt = Math.round((totalSavings * newPercent) / 100);
    setSavingRatio(true);
    try {
      await putSavingsAllocation({ goal_amount: newGoalAmt });
    } catch (err) {
      console.error('Failed to persist ratio split:', err);
    } finally {
      setSavingRatio(false);
    }
  };

  // ── Create New Goal ─────────────────────────────────────────────────────
  const handleCreateGoal = async (e) => {
    e.preventDefault();
    setGoalFormError(null);

    const nameTrimmed = newGoalName.trim();
    const parsedTarget = parseFloat(newGoalTarget);

    if (!nameTrimmed || nameTrimmed.length < 2) {
      setGoalFormError('Please enter a goal name (at least 2 characters).');
      return;
    }

    if (!parsedTarget || parsedTarget <= 0) {
      setGoalFormError('Please enter a valid target amount greater than ₹0.');
      return;
    }

    setCreatingGoal(true);
    try {
      const maxPriority = goals.reduce((max, g) => Math.max(max, g.priority ?? 0), -1);
      const created = await createGoal({
        name: nameTrimmed,
        target_amount: parsedTarget,
        priority: maxPriority + 1,
        allocation_mode: 'manual',
        manual_amount: 0,
      });

      setGoals((prev) => [...prev, created]);
      setNewGoalName('');
      setNewGoalTarget('');
    } catch (err) {
      setGoalFormError(err.message);
    } finally {
      setCreatingGoal(false);
    }
  };

  // ── Add Funds to Goal ───────────────────────────────────────────────────
  const handleAddFunds = async (goalId) => {
    const rawVal = fundingInputs[goalId];
    const addAmt = parseFloat(rawVal);

    if (!addAmt || addAmt <= 0) return;

    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal) return;

    const currentFunded = parseFloat(targetGoal.manual_amount ?? 0);
    const newTotalFunded = currentFunded + addAmt;

    // Optimistic UI Update
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, manual_amount: newTotalFunded } : g))
    );

    // Clear funding input
    setFundingInputs((prev) => ({ ...prev, [goalId]: '' }));
    setFundingActiveId(null);

    try {
      await updateGoal(goalId, { manual_amount: newTotalFunded });
    } catch (err) {
      console.error('Failed to update goal funds:', err);
      // Rollback on error
      setGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, manual_amount: currentFunded } : g))
      );
    }
  };

  // ── Delete Goal ────────────────────────────────────────────────────────
  const handleDeleteGoal = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    try {
      await deleteGoal(goalId);
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  return (
    <div className="layout">
      {/* ── Page Styles ── */}
      <style>{`
        .savings-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 16px 120px;
        }

        .glass-card {
          background: rgba(20, 20, 31, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .glass-card:hover {
          border-color: rgba(124, 106, 246, 0.3);
          box-shadow: 0 24px 60px rgba(124, 106, 246, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        .total-savings-box {
          text-align: center;
          padding: 36px 24px;
          background: linear-gradient(135deg, rgba(124, 106, 246, 0.15) 0%, rgba(168, 85, 247, 0.08) 100%);
          border: 1px solid rgba(124, 106, 246, 0.3);
          border-radius: 20px;
          position: relative;
          overflow: hidden;
        }

        .total-savings-amount {
          font-size: 3.2rem;
          font-weight: 800;
          font-family: 'Space Grotesk', sans-serif;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #A78BFA 0%, #7C6AF6 50%, #38BDF8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 8px 0;
          letter-spacing: -0.5px;
        }

        .ratio-slider-track {
          width: 100%;
          height: 10px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          outline: none;
          cursor: pointer;
          transition: background 0.3s ease;
        }

        .ratio-slider-track::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #7C6AF6;
          box-shadow: 0 0 16px rgba(124, 106, 246, 0.8);
          border: 2px solid #FFFFFF;
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease;
        }

        .ratio-slider-track::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          background: #9333EA;
        }

        .split-card-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        @media (max-width: 640px) {
          .split-card-grid {
            grid-template-columns: 1fr;
          }
        }

        .alloc-pill {
          padding: 16px 20px;
          background: rgba(15, 15, 23, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .goal-card {
          background: rgba(26, 26, 38, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 16px;
          transition: all 0.25s ease;
        }

        .goal-card:hover {
          border-color: rgba(124, 106, 246, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
        }

        .progress-bar-bg {
          width: 100%;
          height: 10px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          overflow: hidden;
          margin: 12px 0 8px;
        }

        .progress-bar-fill-gradient {
          height: 100%;
          background: linear-gradient(90deg, #7C6AF6 0%, #38BDF8 100%);
          border-radius: 6px;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .add-funds-btn {
          padding: 8px 14px;
          font-size: 0.82rem;
          font-weight: 600;
          color: #FFFFFF;
          background: linear-gradient(135deg, #7C6AF6 0%, #9333EA 100%);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .add-funds-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(124, 106, 246, 0.4);
        }

        .section-label-glow {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #94A3B8;
          margin-bottom: 8px;
          display: block;
        }
      `}</style>

      <NavBar title="Savings & Goals" />

      <div className="page">
        <div className="savings-container">
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 className="page-title" style={{ marginBottom: 6 }}>
              Savings & Goals
            </h1>
            <p className="text-muted" style={{ fontSize: '0.92rem' }}>
              Manage your savings pool, split goals vs. stocks, and track progress
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              1. HEADER / TOTAL SAVINGS CARD
             ───────────────────────────────────────────────────────────── */}
          <div className="total-savings-box mb-28">
            <span className="section-label-glow">TOTAL SAVINGS POOL</span>
            <div className="total-savings-amount">
              ₹{totalSavings.toLocaleString('en-IN')}
            </div>
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
              Live allocated balance available for Goals & Investments
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              2. MONTHLY RATIO SPLITTER (GOALS VS STOCKS)
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card mb-32">
            <div className="flex items-center justify-between mb-16">
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  ⚖️ Monthly Ratio Splitter
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Divide your total savings between Goal Savings and Stocks/Investments
                </span>
              </div>
              {savingRatio && (
                <span style={{ fontSize: '0.78rem', color: '#7C6AF6' }}>Saving ratio…</span>
              )}
            </div>

            {/* Range Slider */}
            <div className="mb-20">
              <div className="flex justify-between items-center mb-8" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                <span style={{ color: '#7C6AF6' }}>🎯 Goals: {goalRatioPercent}%</span>
                <span style={{ color: '#34D399' }}>📈 Stocks: {100 - goalRatioPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                className="ratio-slider-track"
                value={goalRatioPercent}
                onChange={(e) => handleRatioChange(Number(e.target.value))}
              />
            </div>

            {/* Resulting Rupee Amounts */}
            <div className="split-card-grid mb-16">
              <div className="alloc-pill" style={{ borderLeft: '4px solid #7C6AF6' }}>
                <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: 600 }}>
                  GOALS ALLOCATION ({goalRatioPercent}%)
                </span>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#A78BFA', fontFamily: 'Space Grotesk, sans-serif' }}>
                  ₹{goalAllocationAmount.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="alloc-pill" style={{ borderLeft: '4px solid #34D399' }}>
                <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: 600 }}>
                  STOCKS ALLOCATION ({100 - goalRatioPercent}%)
                </span>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34D399', fontFamily: 'Space Grotesk, sans-serif' }}>
                  ₹{stocksAllocationAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Helper Note */}
            <p className="text-muted" style={{ fontSize: '0.78rem', textAlign: 'center', margin: 0, fontStyle: 'italic' }}>
              🔒 Ratio locked for the monthly cycle based on initial income allocation.
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              3. INTERACTIVE GOALS MANAGEMENT SECTION
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-24">
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  🎯 Active Goals Management
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Create goals and assign funds from your Goal Allocation pool
                </span>
              </div>
            </div>

            {/* Add Goal Form */}
            <form onSubmit={handleCreateGoal} className="mb-32">
              <span className="section-label-glow">CREATE NEW GOAL</span>
              
              {goalFormError && (
                <div style={{ color: '#F87171', fontSize: '0.82rem', marginBottom: 12 }}>
                  ⚠️ {goalFormError}
                </div>
              )}

              <div className="grid-2 mb-16">
                <div>
                  <input
                    type="text"
                    className="input"
                    placeholder="Goal Name (e.g. New Laptop, Vacation)"
                    value={newGoalName}
                    onChange={(e) => setNewGoalName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <input
                    type="number"
                    className="input"
                    placeholder="Target Amount (₹)"
                    min="1"
                    value={newGoalTarget}
                    onChange={(e) => setNewGoalTarget(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '12px 24px', fontSize: '0.9rem' }}
                disabled={creatingGoal}
              >
                {creatingGoal ? 'Creating…' : '➕ Create Goal'}
              </button>
            </form>

            {/* Goals List Header */}
            <div className="flex items-center justify-between mb-16">
              <span className="section-label-glow" style={{ margin: 0 }}>
                YOUR GOALS ({goals.length})
              </span>
            </div>

            {/* Goals List Cards */}
            {goals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 16 }}>
                <span style={{ fontSize: '2.5rem' }}>🎯</span>
                <p style={{ margin: '8px 0 4px', fontWeight: 600, color: '#F8FAFC' }}>No goals created yet</p>
                <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                  Use the form above to add your first financial goal!
                </p>
              </div>
            ) : (
              goals.map((goal) => {
                const target = parseFloat(goal.target_amount ?? 0);
                const current = parseFloat(goal.manual_amount ?? 0);
                const progressPct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
                const remaining = Math.max(0, target - current);

                return (
                  <div key={goal.id} className="goal-card">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                          {goal.name}
                        </h3>
                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                          Target: ₹{target.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="flex items-center" style={{ gap: 10 }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: progressPct >= 100 ? '#34D399' : '#A78BFA' }}>
                          {progressPct}% Funded
                        </span>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => handleDeleteGoal(goal.id)}
                          title="Delete Goal"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill-gradient"
                        style={{
                          width: `${progressPct}%`,
                          background: progressPct >= 100
                            ? 'linear-gradient(90deg, #10B981, #34D399)'
                            : 'linear-gradient(90deg, #7C6AF6, #38BDF8)',
                        }}
                      />
                    </div>

                    {/* Progress details */}
                    <div className="flex justify-between items-center text-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>
                      <span>Funded: ₹{current.toLocaleString('en-IN')}</span>
                      <span>Remaining: ₹{remaining.toLocaleString('en-IN')}</span>
                    </div>

                    {/* Add Funds Action Row */}
                    <div className="flex items-center" style={{ gap: 8 }}>
                      {fundingActiveId === goal.id ? (
                        <div className="flex items-center" style={{ gap: 8, flex: 1 }}>
                          <input
                            type="number"
                            className="input"
                            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            placeholder="Amount (₹)"
                            min="1"
                            value={fundingInputs[goal.id] || ''}
                            onChange={(e) =>
                              setFundingInputs({ ...fundingInputs, [goal.id]: e.target.value })
                            }
                            autoFocus
                          />
                          <button
                            type="button"
                            className="add-funds-btn"
                            onClick={() => handleAddFunds(goal.id)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                            onClick={() => setFundingActiveId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="add-funds-btn"
                          onClick={() => setFundingActiveId(goal.id)}
                        >
                          💵 Add Funds
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
