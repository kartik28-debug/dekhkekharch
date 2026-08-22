import { useState, useEffect, useCallback } from 'react';
import NavBar from '../components/NavBar';
import { getDashboard } from '../api/dashboard';
import { getBufferReserve, withdrawBufferReserve } from '../api/bufferReserve';
import { getSavingsAllocation, putSavingsAllocation } from '../api/savings';
import {
  calculateMonthlyWantsBreakdown,
  getCurrentWeekFromDay,
  getDaysInMonth,
} from '../lib/weeklyCheckpoint';

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food', icon: '🍔', ratio: 0.35 },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', ratio: 0.20 },
  { id: 'travel', name: 'Travel', icon: '🚗', ratio: 0.20 },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', ratio: 0.15 },
  { id: 'bills', name: 'Bills', icon: '💡', ratio: 0.10 },
  { id: 'others', name: 'Others', icon: '📦', ratio: 0.00 },
];

export default function SmartBudgetingPage() {
  // ── Date Anchor & Calendar Info ──────────────────────────────────────────
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-indexed
  const currentDay = today.getDate();
  const totalDaysInMonth = getDaysInMonth(currentYear, currentMonth);
  const calendarWeekInfo = getCurrentWeekFromDay(currentDay);

  // ── Core Budget & Weekly State ──────────────────────────────────────────
  const [monthlyPool, setMonthlyPool] = useState(10000);
  const [currentWeek, setCurrentWeek] = useState(calendarWeekInfo.weekNumber);
  const [totalWeeks] = useState(4);
  const [activeWSL, setActiveWSL] = useState(2325); // Set by calculateMonthlyWantsBreakdown
  const [remainingPool, setRemainingPool] = useState(10000);

  // Cross-Page Balances
  const [bufferReserveBalance, setBufferReserveBalance] = useState(5000);
  const [savingsPoolBalance, setSavingsPoolBalance] = useState(15000);

  // Form State
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Category System
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('Food');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmoji, setCustomEmoji] = useState('✨');

  // Transactions History State (Current Active Week)
  const [expensesList, setExpensesList] = useState([
    {
      id: 'tx-101',
      amount: 450,
      category: 'Food',
      date: new Date().toISOString().split('T')[0],
      description: 'Lunch Bowl',
      icon: '🍔',
    },
    {
      id: 'tx-102',
      amount: 300,
      category: 'Travel',
      date: new Date().toISOString().split('T')[0],
      description: 'Cab to Work',
      icon: '🚗',
    },
  ]);

  // Settlement & Modal State
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settlementType, setSettlementType] = useState(null); // 'overspend' | 'underspent'
  const [settlementAmount, setSettlementAmount] = useState(0);
  const [settleNotice, setSettleNotice] = useState(null);
  const [formError, setFormError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  // ── Derived Mathematical Wants Breakdown ──────────────────────────────────
  const wantsBreakdown = calculateMonthlyWantsBreakdown(
    monthlyPool,
    currentYear,
    currentMonth
  );

  // ── Initial Fetch & Cross-Page State Sync ────────────────────────────────
  const loadInitialData = useCallback(async () => {
    try {
      const [dashData, bufferData, savingsData] = await Promise.all([
        getDashboard().catch(() => ({})),
        getBufferReserve().catch(() => ({})),
        getSavingsAllocation().catch(() => ({})),
      ]);

      // Monthly Wants Pool (DSL Bucket allocated balance)
      const dslVal = parseFloat(dashData?.buckets?.dsl?.allocated ?? 10000);
      const wantsPool = isNaN(dslVal) || dslVal <= 0 ? 10000 : dslVal;
      setMonthlyPool(wantsPool);

      // Compute mathematical 93%/7% or 100% split based on month length
      const now = new Date();
      const yr = now.getFullYear();
      const mo = now.getMonth() + 1;
      const calcBreakdown = calculateMonthlyWantsBreakdown(wantsPool, yr, mo);

      setActiveWSL(calcBreakdown.weeklyBase);
      setRemainingPool(wantsPool);

      // Buffer Reserve Balance
      const rawBuf = parseFloat(bufferData?.current_balance || bufferData?.balance || 5000);
      setBufferReserveBalance(isNaN(rawBuf) ? 5000 : rawBuf);

      // Savings Goal Pool Balance
      const rawSav = parseFloat(savingsData?.goal_amount ?? 15000);
      setSavingsPoolBalance(isNaN(rawSav) ? 15000 : rawSav);
    } catch (err) {
      console.error('Error fetching initial data for Smart Budgeting:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // ── Derived Weekly Calculations ──────────────────────────────────────────
  const weeklySpentSum = expensesList.reduce((sum, item) => sum + (item.amount || 0), 0);
  const remainingAllowance = activeWSL - weeklySpentSum;
  const spentPercentage = activeWSL > 0 ? Math.min(100, Math.round((weeklySpentSum / activeWSL) * 100)) : 0;

  // Category Budgets breakdown based on activeWSL
  const getCategoryBudget = (catName) => {
    const cat = categories.find((c) => c.name === catName);
    const ratio = cat?.ratio ?? 0.15;
    return Math.round(activeWSL * ratio);
  };

  const getCategorySpent = (catName) => {
    return expensesList
      .filter((item) => item.category === catName)
      .reduce((sum, item) => sum + item.amount, 0);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAddCustomCategory = (e) => {
    e.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;

    const exists = categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      const newCat = {
        id: `custom-${Date.now()}`,
        name: trimmed,
        icon: customEmoji || '✨',
        ratio: 0.10,
      };
      setCategories((prev) => [...prev, newCat]);
      setSelectedCategory(trimmed);
    } else {
      setSelectedCategory(trimmed);
    }

    setCustomName('');
    setIsAddingCustom(false);
  };

  const handleLogExpense = (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccessToast(null);

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setFormError('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (!selectedCategory) {
      setFormError('Please select a category.');
      return;
    }

    const categoryObj = categories.find((c) => c.name === selectedCategory);
    const categoryIcon = categoryObj ? categoryObj.icon : '💸';

    const newTx = {
      id: `tx-${Date.now()}`,
      amount: parsedAmount,
      category: selectedCategory,
      date: date,
      description: description.trim() || selectedCategory,
      icon: categoryIcon,
    };

    setExpensesList((prev) => [newTx, ...prev]);
    setSuccessToast(`Logged ₹${parsedAmount.toLocaleString('en-IN')} for ${selectedCategory}`);
    setAmount('');
    setDescription('');

    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  const handleDeleteExpense = (id) => {
    setExpensesList((prev) => prev.filter((item) => item.id !== id));
  };

  // ── End Week Trigger ──────────────────────────────────────────────────────
  const handleTriggerEndWeek = () => {
    if (weeklySpentSum > activeWSL) {
      // Overspent
      const deficit = weeklySpentSum - activeWSL;
      setSettlementType('overspend');
      setSettlementAmount(deficit);
      setSettleModalOpen(true);
    } else {
      // Underspent / Surplus
      const surplus = activeWSL - weeklySpentSum;
      setSettlementType('underspent');
      setSettlementAmount(surplus);
      setSettleModalOpen(true);
    }
  };

  // ── Overspend Option 1: Deduct from Buffer Reserve ────────────────────────
  const handleOverspendBufferDeduct = async () => {
    const deficit = settlementAmount;

    if (bufferReserveBalance >= deficit) {
      // Deduct from Buffer Reserve
      const newBufferBal = bufferReserveBalance - deficit;
      setBufferReserveBalance(newBufferBal);

      try {
        await withdrawBufferReserve(
          deficit,
          `Overspend Cover (Week ${currentWeek})`,
          'overspend_cover'
        );
      } catch (err) {
        console.error('Failed to log buffer withdrawal:', err);
      }

      setSettleNotice(`✅ ₹${deficit.toLocaleString('en-IN')} covered via Buffer Reserve!`);
    } else {
      // Fallback: Buffer Reserve insufficient → Deduct remainder from Savings Goal Pool
      const coveredByBuffer = bufferReserveBalance;
      const fallbackDeficit = deficit - coveredByBuffer;

      setBufferReserveBalance(0);
      const newSavingsPool = Math.max(0, savingsPoolBalance - fallbackDeficit);
      setSavingsPoolBalance(newSavingsPool);

      try {
        if (coveredByBuffer > 0) {
          await withdrawBufferReserve(coveredByBuffer, `Overspend Cover (Week ${currentWeek})`, 'overspend_cover');
        }
        await putSavingsAllocation({ goal_amount: newSavingsPool });
      } catch (err) {
        console.error('Fallback savings update failed:', err);
      }

      setSettleNotice(
        `⚠️ Buffer Reserve covered ₹${coveredByBuffer.toLocaleString('en-IN')}. Remaining ₹${fallbackDeficit.toLocaleString('en-IN')} deducted from Savings Goal Pool!`
      );
    }

    advanceToNextWeek(wantsBreakdown.weeklyBase);
  };

  // ── Overspend Option 2: Reduce Future Weekly Limits ────────────────────────
  const handleOverspendReduceFuture = () => {
    const remainingWeeks = totalWeeks - currentWeek;
    if (remainingWeeks > 0) {
      const newRemainingPool = Math.max(0, remainingPool - weeklySpentSum);
      const newLimit = Math.round(newRemainingPool / remainingWeeks);
      setRemainingPool(newRemainingPool);
      setActiveWSL(newLimit);
      setSettleNotice(`📉 Future weekly limits reduced to ₹${newLimit.toLocaleString('en-IN')}/week.`);
    } else {
      setSettleNotice(`Final week settled.`);
    }

    advanceToNextWeek();
  };

  // ── Underspent Option 1: Send Surplus to Savings (Goal Pool) ───────────────
  const handleUnderspentSendToSavings = async () => {
    const surplus = settlementAmount;
    const newSavingsPool = savingsPoolBalance + surplus;
    setSavingsPoolBalance(newSavingsPool);

    try {
      await putSavingsAllocation({ goal_amount: newSavingsPool });
    } catch (err) {
      console.error('Failed to send surplus to savings:', err);
    }

    setSettleNotice(`💎 Surplus of ₹${surplus.toLocaleString('en-IN')} transferred to Savings Goal Pool!`);
    const baseline = wantsBreakdown.weeklyBase;
    setActiveWSL(baseline);
    advanceToNextWeek(baseline);
  };

  // ── Underspent Option 2: Increase Future Weekly Limits ─────────────────────
  const handleUnderspentIncreaseFuture = () => {
    const remainingWeeks = totalWeeks - currentWeek;
    if (remainingWeeks > 0) {
      const newRemainingPool = Math.max(0, remainingPool - weeklySpentSum);
      const newLimit = Math.round(newRemainingPool / remainingWeeks);
      setRemainingPool(newRemainingPool);
      setActiveWSL(newLimit);
      setSettleNotice(`📈 Surplus redistributed! Future weekly limits increased to ₹${newLimit.toLocaleString('en-IN')}/week.`);
    } else {
      setSettleNotice(`Final week settled with surplus!`);
    }

    advanceToNextWeek();
  };

  // ── Advance Week Helper ────────────────────────────────────────────────────
  const advanceToNextWeek = (nextLimitOverride) => {
    if (currentWeek < totalWeeks) {
      setCurrentWeek((prev) => prev + 1);
    }
    setExpensesList([]); // Clear active week's transactions
    setSettleModalOpen(false);

    if (nextLimitOverride) {
      setActiveWSL(nextLimitOverride);
    }

    setTimeout(() => {
      setSettleNotice(null);
    }, 5000);
  };

  return (
    <div className="layout">
      {/* ── Custom Dark Glassmorphism Styles ── */}
      <style>{`
        .sb-container {
          max-width: 840px;
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

        .hero-metric-card {
          background: linear-gradient(135deg, rgba(124, 106, 246, 0.15) 0%, rgba(56, 189, 248, 0.08) 100%);
          border: 1px solid rgba(124, 106, 246, 0.3);
          border-radius: 20px;
          padding: 28px;
          margin-bottom: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        .math-breakdown-card {
          background: rgba(15, 15, 26, 0.75);
          border: 1px solid rgba(124, 106, 246, 0.25);
          border-radius: 18px;
          padding: 20px 24px;
          margin-bottom: 28px;
        }

        .metric-value-huge {
          font-size: 2.8rem;
          font-weight: 800;
          font-family: 'Space Grotesk', sans-serif;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.5px;
        }

        .category-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }

        .category-card {
          background: rgba(26, 26, 38, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 18px;
          transition: all 0.25s ease;
        }

        .category-card:hover {
          border-color: rgba(124, 106, 246, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
        }

        .category-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #94A3B8;
          font-size: 0.88rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .category-chip.active {
          background: linear-gradient(135deg, rgba(124, 106, 246, 0.3), rgba(168, 85, 247, 0.2));
          border-color: #7C6AF6;
          color: #FFFFFF;
          box-shadow: 0 0 20px rgba(124, 106, 246, 0.35);
          font-weight: 600;
        }

        .category-chip-add {
          border-style: dashed;
          background: rgba(124, 106, 246, 0.05);
          color: #A855F7;
        }

        .currency-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .currency-symbol {
          position: absolute;
          left: 18px;
          font-size: 1.4rem;
          font-weight: 700;
          color: #7C6AF6;
          pointer-events: none;
        }

        .currency-input {
          width: 100%;
          padding: 16px 18px 16px 44px;
          font-size: 1.5rem;
          font-weight: 700;
          font-family: 'Space Grotesk', sans-serif;
          color: #F8FAFC;
          background: rgba(15, 15, 23, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          outline: none;
          transition: all 0.25s ease;
        }

        .currency-input:focus {
          border-color: #7C6AF6;
          box-shadow: 0 0 24px rgba(124, 106, 246, 0.25);
        }

        .submit-btn {
          width: 100%;
          padding: 16px;
          font-size: 1rem;
          font-weight: 700;
          color: #FFFFFF;
          background: linear-gradient(135deg, #7C6AF6 0%, #9333EA 100%);
          border: none;
          border-radius: 14px;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(124, 106, 246, 0.35);
          transition: all 0.25s ease;
        }

        .submit-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 36px rgba(124, 106, 246, 0.5);
        }

        .progress-bar-bg {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          overflow: hidden;
        }

        .progress-bar-fill-gradient {
          height: 100%;
          border-radius: 6px;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tx-card-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: rgba(26, 26, 38, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          margin-bottom: 10px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999;
          padding: 20px;
        }

        .modal-content {
          background: rgba(20, 20, 31, 0.95);
          border: 1px solid rgba(124, 106, 246, 0.4);
          border-radius: 24px;
          padding: 32px;
          max-width: 520px;
          width: 100%;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
          animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .option-choice-card {
          padding: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          margin-bottom: 14px;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .option-choice-card:hover {
          background: rgba(124, 106, 246, 0.15);
          border-color: #7C6AF6;
          transform: translateY(-2px);
        }

        .section-label-glow {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #94A3B8;
          margin-bottom: 10px;
          display: block;
        }
      `}</style>

      <NavBar title="Smart Budgeting" />

      <div className="page">
        <div className="sb-container">
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 className="page-title" style={{ marginBottom: 6 }}>
              Smart Budgeting
            </h1>
            <p className="text-muted" style={{ fontSize: '0.92rem' }}>
              Dynamic Weekly Spend Limit (DSL) Calculation Engine & Tracker
            </p>
          </div>

          {/* Settle Notice Banner */}
          {settleNotice && (
            <div
              style={{
                background: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                color: '#34D399',
                padding: '14px 20px',
                borderRadius: 16,
                marginBottom: 24,
                fontSize: '0.9rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {settleNotice}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              1. HERO WEEKLY METRIC BAR
             ───────────────────────────────────────────────────────────── */}
          <div className="hero-metric-card">
            <div className="flex justify-between items-center flex-wrap mb-16" style={{ gap: 12 }}>
              <div>
                <span className="section-label-glow" style={{ color: '#A78BFA', margin: 0 }}>
                  WEEKLY SPEND LIMIT (WSL)
                </span>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 0', color: '#F8FAFC' }}>
                  {calendarWeekInfo.label}
                </h2>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '10px 20px', fontSize: '0.88rem', fontWeight: 700 }}
                onClick={handleTriggerEndWeek}
              >
                ⚡ End Week {currentWeek} & Settle
              </button>
            </div>

            {/* Huge Metrics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 20,
                marginBottom: 20,
              }}
            >
              <div>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Active Weekly Limit ($WSL$)
                </span>
                <div className="metric-value-huge" style={{ color: '#F8FAFC' }}>
                  ₹{activeWSL.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Total Spent This Week ($X$)
                </span>
                <div
                  className="metric-value-huge"
                  style={{
                    color: weeklySpentSum > activeWSL ? '#F87171' : '#F8FAFC',
                  }}
                >
                  ₹{weeklySpentSum.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Remaining Allowance
                </span>
                <div
                  className="metric-value-huge"
                  style={{
                    color: remainingAllowance < 0 ? '#F87171' : '#34D399',
                  }}
                >
                  ₹{remainingAllowance.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Overall Weekly Progress Bar */}
            <div className="progress-bar-bg" style={{ height: 10 }}>
              <div
                className="progress-bar-fill-gradient"
                style={{
                  width: `${spentPercentage}%`,
                  background:
                    spentPercentage >= 90
                      ? 'linear-gradient(90deg, #EF4444, #F87171)'
                      : spentPercentage >= 70
                      ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                      : 'linear-gradient(90deg, #7C6AF6, #34D399)',
                }}
              />
            </div>

            <div className="flex justify-between items-center mt-8 text-muted" style={{ fontSize: '0.78rem' }}>
              <span>Spent {spentPercentage}% of Weekly Limit</span>
              <span>Buffer Reserve Available: ₹{bufferReserveBalance.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              2. MATHEMATICAL WANTS POOL & CUSHION BREAKDOWN CARD
             ───────────────────────────────────────────────────────────── */}
          <div className="math-breakdown-card">
            <div className="flex justify-between items-center flex-wrap mb-12" style={{ gap: 10 }}>
              <div>
                <span className="section-label-glow" style={{ color: '#38BDF8', margin: 0 }}>
                  MONTHLY WANTS ENGINE (SALARY ANCHOR: 1st OF MONTH)
                </span>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#F8FAFC', marginTop: 2 }}>
                  Total Month Length: <strong>{totalDaysInMonth} Days</strong> ({wantsBreakdown.totalDays === 28 ? 'February' : 'Standard 30/31 Day Month'})
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#A78BFA',
                  background: 'rgba(124, 106, 246, 0.15)',
                  padding: '4px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(124, 106, 246, 0.3)',
                }}
              >
                ⚓ Day {currentDay} of {totalDaysInMonth}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 14,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <span className="text-muted" style={{ fontSize: '0.74rem' }}>
                  Total Monthly Wants ($W$)
                </span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#F8FAFC', fontFamily: 'Space Grotesk' }}>
                  ₹{monthlyPool.toLocaleString('en-IN')}
                </div>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(124, 106, 246, 0.08)',
                  borderRadius: 12,
                  border: '1px solid rgba(124, 106, 246, 0.2)',
                }}
              >
                <span style={{ fontSize: '0.74rem', color: '#A78BFA', fontWeight: 600 }}>
                  {totalDaysInMonth === 28 ? '4-Week Pool (100%)' : '4-Week Pool (93%)'}
                </span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#A78BFA', fontFamily: 'Space Grotesk' }}>
                  ₹{wantsBreakdown.fourWeeksPool.toLocaleString('en-IN')}
                </div>
                <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                  Baseline: ₹{wantsBreakdown.weeklyBase.toLocaleString('en-IN')}/wk (Days 1–28)
                </span>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(56, 189, 248, 0.08)',
                  borderRadius: 12,
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                }}
              >
                <span style={{ fontSize: '0.74rem', color: '#38BDF8', fontWeight: 600 }}>
                  Month-End Cushion ({totalDaysInMonth === 28 ? '0%' : '7%'})
                </span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38BDF8', fontFamily: 'Space Grotesk' }}>
                  ₹{wantsBreakdown.cushionBuffer.toLocaleString('en-IN')}
                </div>
                <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                  {totalDaysInMonth === 28 ? 'No extra days' : 'Dedicated for Days 29–31'}
                </span>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              3. PER-CATEGORY PROGRESS BREAKDOWN
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card mb-32">
            <div className="flex justify-between items-center mb-20">
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  📊 Category Budgets & Spending
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Real-time budget allocation breakdown for Week {currentWeek}
                </span>
              </div>
            </div>

            <div className="category-grid">
              {categories.map((cat) => {
                const budget = getCategoryBudget(cat.name);
                const spent = getCategorySpent(cat.name);
                const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                const isOver = spent > budget && budget > 0;
                const isNear = pct >= 70 && !isOver;

                return (
                  <div key={cat.id} className="category-card">
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <span style={{ fontSize: '1.2rem' }}>{cat.icon}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#F8FAFC' }}>
                          {cat.name}
                        </span>
                      </div>

                      {isOver ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#F87171',
                            background: 'rgba(248, 113, 113, 0.15)',
                            padding: '2px 6px',
                            borderRadius: 6,
                          }}
                        >
                          🚨 Exceeded
                        </span>
                      ) : isNear ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#FBBF24',
                            background: 'rgba(245, 158, 11, 0.15)',
                            padding: '2px 6px',
                            borderRadius: 6,
                          }}
                        >
                          ⚠️ Near Limit
                        </span>
                      ) : null}
                    </div>

                    <div className="flex justify-between items-center mb-6" style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: isOver ? '#F87171' : '#F8FAFC', fontWeight: 700 }}>
                        ₹{spent.toLocaleString('en-IN')}
                      </span>
                      <span className="text-muted">
                        of ₹{budget.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill-gradient"
                        style={{
                          width: `${pct}%`,
                          background: isOver
                            ? '#EF4444'
                            : isNear
                            ? '#F59E0B'
                            : 'linear-gradient(90deg, #7C6AF6, #38BDF8)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              4. LOG EXPENSE FORM SECTION
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card mb-32">
            <div className="flex items-center justify-between mb-24">
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  💸 Log Expense
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Record transactions to update weekly progress in real-time
                </span>
              </div>
            </div>

            {formError && (
              <div
                style={{
                  background: 'rgba(248, 113, 113, 0.1)',
                  border: '1px solid rgba(248, 113, 113, 0.3)',
                  color: '#F87171',
                  padding: '12px 16px',
                  borderRadius: 12,
                  marginBottom: 20,
                  fontSize: '0.85rem',
                }}
              >
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleLogExpense}>
              {/* Amount */}
              <div className="mb-24">
                <span className="section-label-glow">AMOUNT</span>
                <div className="currency-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input
                    type="number"
                    className="currency-input"
                    placeholder="0.00"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Category selector */}
              <div className="mb-24">
                <span className="section-label-glow">CATEGORY</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`category-chip ${selectedCategory === cat.name ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.name)}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </button>
                  ))}

                  <button
                    type="button"
                    className="category-chip category-chip-add"
                    onClick={() => setIsAddingCustom(!isAddingCustom)}
                  >
                    <span>➕</span>
                    <span>Add Custom Category</span>
                  </button>
                </div>

                {isAddingCustom && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 12,
                      padding: 12,
                      background: 'rgba(15, 15, 23, 0.6)',
                      border: '1px solid rgba(124, 106, 246, 0.3)',
                      borderRadius: 12,
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      style={{ width: 60, textAlign: 'center' }}
                      placeholder="Icon"
                      value={customEmoji}
                      onChange={(e) => setCustomEmoji(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="Category name (e.g. Gym)"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                      onClick={handleAddCustomCategory}
                    >
                      Add & Select
                    </button>
                  </div>
                )}
              </div>

              {/* Date & Description */}
              <div className="grid-2 mb-24">
                <div>
                  <span className="section-label-glow">DATE</span>
                  <input
                    type="date"
                    className="input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <span className="section-label-glow">DESCRIPTION (OPTIONAL)</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Dinner with team"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="submit-btn">
                ✨ Log Expense
              </button>
            </form>

            {successToast && (
              <div
                style={{
                  marginTop: 20,
                  padding: '14px 18px',
                  background: 'rgba(52, 211, 153, 0.12)',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                  borderRadius: 12,
                  color: '#34D399',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                }}
              >
                ✅ {successToast}
              </div>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────
              5. RECENT EXPENSES / TRANSACTION HISTORY SECTION
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-20">
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  📜 Week {currentWeek} Transactions
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Live history of logged transactions for this active week
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#94A3B8',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {expensesList.length} {expensesList.length === 1 ? 'Entry' : 'Entries'}
              </span>
            </div>

            {expensesList.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  border: '1px dashed rgba(255,255,255,0.1)',
                  borderRadius: 16,
                }}
              >
                <span style={{ fontSize: '2.5rem' }}>🧾</span>
                <p style={{ margin: '8px 0 4px', fontWeight: 600, color: '#F8FAFC' }}>
                  No expenses logged yet for Week {currentWeek}
                </p>
                <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                  Logged transactions will appear here instantly.
                </p>
              </div>
            ) : (
              <div>
                {expensesList.map((tx) => (
                  <div key={tx.id} className="tx-card-item">
                    <div className="flex items-center" style={{ gap: 14 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          background: 'rgba(124, 106, 246, 0.12)',
                          border: '1px solid rgba(124, 106, 246, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.25rem',
                        }}
                      >
                        {tx.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#F8FAFC' }}>
                          {tx.description}
                        </div>
                        <div className="flex items-center" style={{ gap: 8, marginTop: 2 }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              color: '#A78BFA',
                              background: 'rgba(124, 106, 246, 0.12)',
                              padding: '2px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {tx.category}
                          </span>
                          <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                            {tx.date}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center" style={{ gap: 12 }}>
                      <span
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          fontFamily: 'Space Grotesk',
                          color: '#F87171',
                        }}
                      >
                        -₹{tx.amount.toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleDeleteExpense(tx.id)}
                        title="Delete Transaction"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          DYNAMIC SETTLEMENT RECALCULATION MODAL
         ───────────────────────────────────────────────────────────── */}
      {settleModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            {settlementType === 'overspend' ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: '3rem' }}>🚨</span>
                  <h2 style={{ color: '#F87171', margin: '8px 0 4px', fontSize: '1.4rem' }}>
                    Weekly Budget Exceeded!
                  </h2>
                  <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                    You spent <strong style={{ color: '#F87171' }}>₹{weeklySpentSum.toLocaleString('en-IN')}</strong> against your limit of ₹{activeWSL.toLocaleString('en-IN')}.
                  </p>
                  <div
                    style={{
                      background: 'rgba(248, 113, 113, 0.12)',
                      border: '1px solid rgba(248, 113, 113, 0.3)',
                      color: '#F87171',
                      padding: '10px',
                      borderRadius: 12,
                      marginTop: 12,
                      fontWeight: 700,
                      fontSize: '1.1rem',
                    }}
                  >
                    Deficit: ₹{settlementAmount.toLocaleString('en-IN')}
                  </div>
                </div>

                <p className="section-label-glow">SELECT RECALCULATION ACTION</p>

                <div className="option-choice-card" onClick={handleOverspendBufferDeduct}>
                  <div style={{ fontWeight: 700, color: '#38BDF8', fontSize: '0.95rem' }}>
                    🛡️ Deduct from Buffer Reserve
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                    Cover ₹{settlementAmount.toLocaleString('en-IN')} using your Buffer Reserve (₹{bufferReserveBalance.toLocaleString('en-IN')} available). Keeps upcoming weekly limits unchanged.
                  </p>
                </div>

                <div className="option-choice-card" onClick={handleOverspendReduceFuture}>
                  <div style={{ fontWeight: 700, color: '#FBBF24', fontSize: '0.95rem' }}>
                    📉 Reduce Future Weekly Limits
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                    Deduct the deficit from remaining monthly pool. Automatically recalculates and lowers limits for remaining weeks.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: '3rem' }}>🎉</span>
                  <h2 style={{ color: '#34D399', margin: '8px 0 4px', fontSize: '1.4rem' }}>
                    Weekly Surplus Available!
                  </h2>
                  <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                    Great job! You spent ₹{weeklySpentSum.toLocaleString('en-IN')} out of ₹{activeWSL.toLocaleString('en-IN')}.
                  </p>
                  <div
                    style={{
                      background: 'rgba(52, 211, 153, 0.12)',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                      color: '#34D399',
                      padding: '10px',
                      borderRadius: 12,
                      marginTop: 12,
                      fontWeight: 700,
                      fontSize: '1.1rem',
                    }}
                  >
                    Surplus: ₹{settlementAmount.toLocaleString('en-IN')}
                  </div>
                </div>

                <p className="section-label-glow">SELECT SURPLUS ALLOCATION</p>

                <div className="option-choice-card" onClick={handleUnderspentSendToSavings}>
                  <div style={{ fontWeight: 700, color: '#A78BFA', fontSize: '0.95rem' }}>
                    💎 Send to Savings (Goal Pool)
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                    Add ₹{settlementAmount.toLocaleString('en-IN')} directly to your Savings Goal Pool. Resets next week to baseline.
                  </p>
                </div>

                <div className="option-choice-card" onClick={handleUnderspentIncreaseFuture}>
                  <div style={{ fontWeight: 700, color: '#38BDF8', fontSize: '0.95rem' }}>
                    📈 Increase Future Weekly Limits
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                    Redistribute your surplus across remaining weeks, boosting your future weekly allowance.
                  </p>
                </div>
              </>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => setSettleModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
