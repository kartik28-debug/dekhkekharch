import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ListItem from '../components/ListItem';

const MOCK_TRANSACTIONS = [
  { id: 1, name: 'Zomato', category: 'Food', amount: 340 },
  { id: 2, name: 'Uber', category: 'Travel', amount: 180 },
  { id: 3, name: 'BookMyShow', category: 'Entertainment', amount: 520 },
  { id: 4, name: 'Swiggy', category: 'Food', amount: 260 },
];

const DEFAULT_CATEGORIES = ['Food', 'Travel', 'Entertainment'];

let nextId = MOCK_TRANSACTIONS.length + 1;

function TxnForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', category: '', amount: '' });
  const change = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  return (
    <div className="col">
      <div className="input-group">
        <label>Description</label>
        <input name="name" className="input" placeholder="e.g. Zomato" value={form.name} onChange={change} />
      </div>
      <div className="grid-2">
        <div className="input-group">
          <label>Category</label>
          <input name="category" className="input" placeholder="Food" value={form.category} onChange={change} />
        </div>
        <div className="input-group">
          <label>Amount (₹)</label>
          <input name="amount" type="number" className="input" placeholder="0" value={form.amount} onChange={change} />
        </div>
      </div>
      <div className="row mt-8">
        <Button onClick={() => onSave(form)}>Save</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function SmartBudgetingPage() {
  const navigate = useNavigate();
  const [txns, setTxns] = useState(MOCK_TRANSACTIONS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState('Food');
  const [newCat, setNewCat] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [editing, setEditing] = useState(null);
  const [depositModal, setDepositModal] = useState(false);

  const dslValue = 3420;

  const openAdd  = () => setModalMode('add');
  const openEdit = t  => { setEditing(t); setModalMode('edit'); };
  const closeModal = () => { setModalMode(null); setEditing(null); };

  const handleAdd = form => {
    if (!form.name) return;
    setTxns(p => [...p, { id: nextId++, name: form.name, category: form.category || activeCategory, amount: +form.amount || 0 }]);
    closeModal();
  };

  const handleEdit = form => {
    setTxns(p => p.map(t => t.id === editing.id
      ? { ...t, name: form.name, category: form.category, amount: +form.amount || 0 }
      : t));
    closeModal();
  };

  const handleDelete = id => setTxns(p => p.filter(t => t.id !== id));

  const addCategory = () => {
    const cat = newCat.trim();
    if (cat && !categories.includes(cat)) setCategories(p => [...p, cat]);
    setNewCat('');
    setAddingCat(false);
  };

  const spent = txns.filter(t => t.category === activeCategory).reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <NavBar title="Smart Budgeting" />
      <div className="page">
        <div className="flex items-center justify-between mb-16">
          <h1 className="page-title" style={{ marginBottom: 0 }}>Smart Budgeting</h1>
          <Button id="add-txn-btn" onClick={openAdd}>+ Add</Button>
        </div>

        {/* DSL display — signature visual centerpiece */}
        {(() => {
          const pct = Math.round((spent / dslValue) * 100);
          const glowClass = pct >= 90 ? 'danger' : pct >= 65 ? 'warn' : '';
          const valueColor = pct >= 90
            ? 'linear-gradient(135deg, #EF4444, #F87171)'
            : pct >= 65
            ? 'linear-gradient(135deg, #D97706, #FBBF24)'
            : 'linear-gradient(135deg, #E4E4EB, #A78BFA)';
          return (
            <div className="dsl-box mb-24">
              <p className="dsl-label">Daily Safe Limit — This Week</p>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <span className={`dsl-glow-ring ${glowClass}`}>
                  <p className="dsl-value" style={{ background: valueColor, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    ₹{dslValue.toLocaleString()}
                  </p>
                </span>
              </div>
              <p className="dsl-sub">Spent ₹{spent.toLocaleString()} · {pct}% used</p>
              <div className="progress-bar-track" style={{ marginTop: 12, maxWidth: 280, margin: '12px auto 0' }}>
                <div className="progress-bar-fill" style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: pct >= 90 ? 'linear-gradient(90deg, #EF4444, #F87171)'
                             : pct >= 65 ? 'linear-gradient(90deg, #D97706, #FBBF24)'
                             : 'linear-gradient(90deg, var(--accent), var(--accent-2))'
                }} />
              </div>
            </div>
          );
        })()}

        {/* Category selector */}
        <p className="section-label">Weekly Category</p>
        <div className="chip-row mb-8">
          {categories.map(cat => (
            <button
              key={cat}
              id={`cat-${cat.toLowerCase()}`}
              className={`chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
          {!addingCat ? (
            <button className="chip" id="add-category-chip" onClick={() => setAddingCat(true)}>+ Custom</button>
          ) : (
            <div className="row gap-8">
              <input
                id="new-category-input"
                className="input"
                style={{ width: 130, padding: '5px 10px', fontSize: '0.82rem' }}
                placeholder="Category name"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                autoFocus
              />
              <Button size="sm" onClick={addCategory}>Add</Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingCat(false)}>✕</Button>
            </div>
          )}
        </div>
        <hr className="divider" />

        {/* Transaction list */}
        <p className="section-label">Transactions</p>
        <div className="col">
          {txns.map(t => (
            <ListItem
              key={t.id}
              title={t.name}
              subtitle={`${t.category} · ₹${t.amount.toLocaleString()}`}
              onEdit={() => openEdit(t)}
              onDelete={() => handleDelete(t.id)}
            />
          ))}
        </div>

        {/* Deposit button */}
        <div className="mt-24">
          <Button id="deposit-btn" variant="accent2" full onClick={() => setDepositModal(true)}>
            💸 Deposit Surplus
          </Button>
        </div>
      </div>

      {/* Add / Edit modals */}
      <Modal open={modalMode === 'add'} onClose={closeModal} title="Add Transaction">
        <TxnForm onSave={handleAdd} onCancel={closeModal} />
      </Modal>
      <Modal open={modalMode === 'edit'} onClose={closeModal} title="Edit Transaction">
        {editing && (
          <TxnForm
            initial={{ name: editing.name, category: editing.category, amount: editing.amount }}
            onSave={handleEdit}
            onCancel={closeModal}
          />
        )}
      </Modal>

      {/* Deposit destination modal */}
      <Modal open={depositModal} onClose={() => setDepositModal(false)} title="Send surplus to…">
        <div className="col">
          <Button variant="success" full onClick={() => navigate('/savings')}>💎 Savings</Button>
          <Button variant="secondary" full onClick={() => navigate('/emergency')}>🛡️ Emergency Fund</Button>
          <Button variant="secondary" full onClick={() => setDepositModal(false)}>Cancel</Button>
        </div>
      </Modal>
    </>
  );
}
