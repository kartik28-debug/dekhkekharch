import { useState } from 'react';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ListItem from '../components/ListItem';

const MOCK_EXPENSES = [
  { id: 1, name: 'Rent', amount: 15000, budget: 15000 },
  { id: 2, name: 'EMI – Laptop', amount: 3200, budget: 3500 },
  { id: 3, name: 'Electricity Bill', amount: 1200, budget: 1500 },
  { id: 4, name: 'Internet', amount: 999, budget: 1000 },
  { id: 5, name: 'OTT Subscriptions', amount: 649, budget: 700 },
];

let nextId = MOCK_EXPENSES.length + 1;

function ExpenseForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name: '', amount: '', budget: '' });
  const change = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  return (
    <div className="col">
      <div className="input-group">
        <label>Expense Name</label>
        <input name="name" className="input" placeholder="e.g. Rent" value={form.name} onChange={change} />
      </div>
      <div className="grid-2">
        <div className="input-group">
          <label>Amount (₹)</label>
          <input name="amount" type="number" className="input" placeholder="0" value={form.amount} onChange={change} />
        </div>
        <div className="input-group">
          <label>Budget (₹)</label>
          <input name="budget" type="number" className="input" placeholder="0" value={form.budget} onChange={change} />
        </div>
      </div>
      <div className="row mt-8">
        <Button onClick={() => onSave(form)}>Save</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function MajorExpensesPage() {
  const [expenses, setExpenses] = useState(MOCK_EXPENSES);
  const [modalMode, setModalMode] = useState(null); // 'add' | { id, expense }
  const [editing, setEditing] = useState(null);

  const openAdd  = () => setModalMode('add');
  const openEdit = exp => { setEditing(exp); setModalMode('edit'); };
  const closeModal = () => { setModalMode(null); setEditing(null); };

  const handleAdd = form => {
    if (!form.name) return;
    setExpenses(p => [...p, { id: nextId++, name: form.name, amount: +form.amount || 0, budget: +form.budget || 0 }]);
    closeModal();
  };

  const handleEdit = form => {
    setExpenses(p => p.map(e => e.id === editing.id
      ? { ...e, name: form.name, amount: +form.amount || 0, budget: +form.budget || 0 }
      : e));
    closeModal();
  };

  const handleDelete = id => setExpenses(p => p.filter(e => e.id !== id));

  const total  = expenses.reduce((s, e) => s + e.amount, 0);
  const budget = expenses.reduce((s, e) => s + e.budget, 0);

  return (
    <>
      <NavBar title="Major Expenses" />
      <div className="page">
        <div className="flex items-center justify-between mb-16">
          <h1 className="page-title" style={{ marginBottom: 0 }}>Major Expenses</h1>
          <Button id="add-expense-btn" onClick={openAdd}>+ Add</Button>
        </div>

        {/* Summary strip */}
        <div className="grid-2 mb-24">
          <div className="card">
            <p className="section-label mb-8">Total Spent</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(135deg, #EF4444, #F87171)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>₹{total.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="section-label mb-8">Total Budget</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(135deg, #16A34A, #4ADE80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>₹{budget.toLocaleString()}</p>
          </div>
        </div>

        <p className="section-label">All Expenses</p>
        <div className="col">
          {expenses.map(exp => (
            <ListItem
              key={exp.id}
              title={exp.name}
              subtitle={`Spent ₹${exp.amount.toLocaleString()} · Budget ₹${exp.budget.toLocaleString()}`}
              onEdit={() => openEdit(exp)}
              onDelete={() => handleDelete(exp.id)}
              extra={
                <div className="progress-bar-track mt-8">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.min((exp.amount / (exp.budget || 1)) * 100, 100)}%` }}
                  />
                </div>
              }
            />
          ))}
        </div>
      </div>

      {/* Add modal */}
      <Modal open={modalMode === 'add'} onClose={closeModal} title="Add Expense">
        <ExpenseForm onSave={handleAdd} onCancel={closeModal} />
      </Modal>

      {/* Edit modal */}
      <Modal open={modalMode === 'edit'} onClose={closeModal} title="Edit Expense">
        {editing && (
          <ExpenseForm
            initial={{ name: editing.name, amount: editing.amount, budget: editing.budget }}
            onSave={handleEdit}
            onCancel={closeModal}
          />
        )}
      </Modal>
    </>
  );
}
