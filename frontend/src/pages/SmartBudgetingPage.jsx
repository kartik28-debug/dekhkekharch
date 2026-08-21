import { useState } from 'react';
import NavBar from '../components/NavBar';

const INITIAL_CATEGORIES = [
  { id: 'food', name: 'Food', icon: '🍔' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
  { id: 'travel', name: 'Travel', icon: '🚗' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'bills', name: 'Bills', icon: '💡' },
  { id: 'others', name: 'Others', icon: '📦' },
];

const INITIAL_EXPENSES = [
  {
    id: 'tx-1',
    amount: 450,
    category: 'Food',
    date: new Date().toISOString().split('T')[0],
    description: 'Zomato Lunch Order',
    icon: '🍔',
  },
  {
    id: 'tx-2',
    amount: 280,
    category: 'Travel',
    date: new Date().toISOString().split('T')[0],
    description: 'Uber Ride',
    icon: '🚗',
  },
];

export default function SmartBudgetingPage() {
  // ── Form State ──────────────────────────────────────────────────────────
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // ── Category System State ───────────────────────────────────────────────
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('Food');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmoji, setCustomEmoji] = useState('✨');

  // ── Transaction History State ───────────────────────────────────────────
  const [expensesList, setExpensesList] = useState(INITIAL_EXPENSES);

  // ── Feedback & Output State ─────────────────────────────────────────────
  const [successMessage, setSuccessMessage] = useState(null);
  const [formError, setFormError] = useState(null);

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
      };
      setCategories((prev) => [...prev, newCat]);
      setSelectedCategory(trimmed);
    } else {
      setSelectedCategory(trimmed);
    }

    setCustomName('');
    setIsAddingCustom(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setFormError('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (!selectedCategory) {
      setFormError('Please select a category.');
      return;
    }

    // Find category icon
    const categoryObj = categories.find((c) => c.name === selectedCategory);
    const categoryIcon = categoryObj ? categoryObj.icon : '💸';

    // Construct new transaction entry
    const newTransaction = {
      id: `tx-${Date.now()}`,
      amount: parsedAmount,
      category: selectedCategory,
      date: date,
      description: description.trim() || selectedCategory,
      icon: categoryIcon,
    };

    // Update Transaction History State (prepend to top)
    setExpensesList((prev) => [newTransaction, ...prev]);

    // Show temporary success feedback toast
    setSuccessMessage(`Logged ₹${parsedAmount.toLocaleString('en-IN')} for ${selectedCategory}`);

    // Reset form inputs
    setAmount('');
    setDescription('');

    // Clear success message after 4 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleDeleteExpense = (id) => {
    setExpensesList((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="layout">
      {/* ── Custom Glassmorphism & Micro-Animation Styles ── */}
      <style>{`
        .sb-container {
          max-width: 720px;
          margin: 0 auto;
          padding: 0 16px 120px;
        }

        .glass-card {
          background: rgba(20, 20, 31, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 32px 28px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .glass-card:hover {
          border-color: rgba(124, 106, 246, 0.3);
          box-shadow: 0 24px 60px rgba(124, 106, 246, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.15);
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
          user-select: none;
        }

        .category-chip:hover {
          background: rgba(124, 106, 246, 0.1);
          border-color: rgba(124, 106, 246, 0.3);
          color: #F8FAFC;
          transform: translateY(-2px);
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
          color: var(--accent-2, #A855F7);
        }

        .category-chip-add:hover {
          background: rgba(124, 106, 246, 0.18);
          border-color: var(--accent-2, #A855F7);
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
          background: rgba(15, 15, 23, 0.95);
        }

        .currency-input::placeholder {
          color: #475569;
          font-weight: 500;
        }

        .custom-cat-input-group {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 12px;
          background: rgba(15, 15, 23, 0.6);
          border: 1px solid rgba(124, 106, 246, 0.3);
          border-radius: 12px;
          animation: fadeIn 0.2s ease-in-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
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
          filter: brightness(1.08);
        }

        .toast-success {
          margin-top: 20px;
          padding: 14px 18px;
          background: rgba(52, 211, 153, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.3);
          border-radius: 12px;
          color: #34D399;
          font-size: 0.88rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: fadeIn 0.3s ease;
        }

        .tx-card-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: rgba(26, 26, 38, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          margin-bottom: 10px;
          transition: all 0.2s ease;
        }

        .tx-card-item:hover {
          background: rgba(30, 30, 45, 0.8);
          border-color: rgba(124, 106, 246, 0.25);
          transform: translateX(2px);
        }

        .tx-icon-badge {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(124, 106, 246, 0.12);
          border: 1px solid rgba(124, 106, 246, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .tx-amount-neg {
          font-size: 1.05rem;
          font-weight: 700;
          font-family: 'Space Grotesk', sans-serif;
          color: #F87171;
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
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 className="page-title" style={{ marginBottom: 8 }}>
              Smart Budgeting
            </h1>
            <p className="text-muted" style={{ fontSize: '0.92rem' }}>
              Track daily expenses with real-time recalculating spending limits
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              LOG EXPENSE SECTION
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card mb-32">
            <div className="flex items-center justify-between mb-24">
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  💸 Log Expense
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Record a transaction to update your daily spend limit
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

            <form onSubmit={handleSubmit}>
              {/* 1. Amount Field */}
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

              {/* 2. Category Selection System */}
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

                  {/* Add Custom Category Toggle Chip */}
                  <button
                    type="button"
                    className="category-chip category-chip-add"
                    onClick={() => setIsAddingCustom(!isAddingCustom)}
                  >
                    <span>➕</span>
                    <span>Add Custom Category</span>
                  </button>
                </div>

                {/* Inline Custom Category Creator */}
                {isAddingCustom && (
                  <div className="custom-cat-input-group">
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
                      placeholder="Category name (e.g. Subscriptions)"
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

              {/* 3. Date & Description Row */}
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
                    placeholder="e.g. Dinner with team, Taxi"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button type="submit" className="submit-btn">
                ✨ Log Expense
              </button>
            </form>

            {/* Success Toast */}
            {successMessage && (
              <div className="toast-success">
                <span>✅</span>
                <span>{successMessage}</span>
              </div>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────
              RECENT EXPENSES / TRANSACTION HISTORY SECTION
             ───────────────────────────────────────────────────────────── */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-20">
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                  📜 Recent Expenses
                </h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Live history of logged transactions for this period
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

            {/* List or Empty State */}
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
                  No expenses logged yet this week
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
                      <div className="tx-icon-badge">{tx.icon}</div>
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
                      <span className="tx-amount-neg">
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
    </div>
  );
}
