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

  // ── Feedback & Output State ─────────────────────────────────────────────
  const [submittedPayload, setSubmittedPayload] = useState(null);
  const [formError, setFormError] = useState(null);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAddCustomCategory = (e) => {
    e.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;

    // Check if category already exists (case-insensitive)
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

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setFormError('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (!selectedCategory) {
      setFormError('Please select a category.');
      return;
    }

    // Exact payload structure required for backend integration
    const payload = {
      amount: parsedAmount,
      category: selectedCategory,
      date: date,
      description: description.trim(),
    };

    console.log('[SmartBudgeting] Log Expense Payload:', payload);
    setSubmittedPayload(payload);

    // Reset amount & description after successful submission
    setAmount('');
    setDescription('');
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

        .submit-btn:active {
          transform: translateY(0);
        }

        .payload-preview {
          margin-top: 24px;
          padding: 16px 20px;
          background: rgba(74, 222, 128, 0.08);
          border: 1px solid rgba(74, 222, 128, 0.25);
          border-radius: 14px;
          color: #4ADE80;
          font-size: 0.85rem;
          animation: fadeIn 0.3s ease;
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

        .placeholder-section {
          padding: 20px;
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          color: #64748B;
          text-align: center;
          font-size: 0.82rem;
          margin-bottom: 24px;
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
              FUTURE STEP: DSL Metrics & Summary Cards Wrapper
              (Left clean for plugging in metrics, WSL progress, and rings)
             ───────────────────────────────────────────────────────────── */}
          {/* <div className="placeholder-section">
            [FUTURE STEP: DSL Metrics & Summary Cards]
          </div> */}

          {/* ─────────────────────────────────────────────────────────────
              LOG EXPENSE SECTION (Modernized Glass Container)
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

            {/* Submitted Payload Confirmation */}
            {submittedPayload && (
              <div className="payload-preview">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  ✅ Expense Logged Successfully!
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', opacity: 0.9 }}>
                  Payload: {JSON.stringify(submittedPayload, null, 2)}
                </div>
              </div>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────
              FUTURE STEP: Spending Charts & Analytics Placeholder
             ───────────────────────────────────────────────────────────── */}
          {/* <div className="placeholder-section">
            [FUTURE STEP: Spending Charts & Analytics]
          </div> */}

          {/* ─────────────────────────────────────────────────────────────
              FUTURE STEP: Recent Transactions List Placeholder
             ───────────────────────────────────────────────────────────── */}
          {/* <div className="placeholder-section">
            [FUTURE STEP: Recent Transactions List]
          </div> */}
        </div>
      </div>
    </div>
  );
}
