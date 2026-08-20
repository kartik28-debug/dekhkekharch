import { useState } from 'react';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Modal from '../components/Modal';

const MOCK_BALANCE = 18500;

export default function EmergencyPage() {
  const [balance, setBalance] = useState(MOCK_BALANCE);
  const [depositModal, setDepositModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');

  const handleDeposit = () => {
    const n = +amount;
    if (n > 0) setBalance(b => b + n);
    setAmount('');
    setDepositModal(false);
  };

  const handleWithdraw = () => {
    const n = +amount;
    if (n > 0 && n <= balance) setBalance(b => b - n);
    setAmount('');
    setWithdrawModal(false);
  };

  return (
    <>
      <NavBar title="Emergency Fund" />
      <div className="page">
        <h1 className="page-title">Emergency Fund</h1>

        {/* Balance */}
        <div className="balance-box mb-24">
          <p className="balance-label">Current Balance</p>
          <p className="balance-amount green">₹{balance.toLocaleString()}</p>
          <p className="text-muted mt-8" style={{ fontSize: '0.8rem' }}>
            {balance >= 30000 ? '✅ Target met' : `₹${(30000 - balance).toLocaleString()} away from ₹30,000 target`}
          </p>
          <div className="progress-bar-track mt-12">
            <div className="progress-bar-fill" style={{ width: `${Math.min((balance / 30000) * 100, 100)}%` }} />
          </div>
        </div>

        {/* History placeholder */}
        <p className="section-label">Recent Activity</p>
        <div className="col mb-24">
          {[
            { label: 'Deposit', amount: '+₹5,000', date: 'Aug 10, 2026', color: 'var(--success)' },
            { label: 'Withdrawal (Medical)', amount: '-₹2,000', date: 'Aug 3, 2026', color: 'var(--danger)' },
            { label: 'Deposit', amount: '+₹3,500', date: 'Jul 28, 2026', color: 'var(--success)' },
          ].map((item, i) => (
            <div key={i} className="list-item">
              <div className="list-item-content">
                <div className="list-item-title">{item.label}</div>
                <div className="list-item-sub">{item.date}</div>
              </div>
              <span style={{ fontWeight: 700, color: item.color }}>{item.amount}</span>
            </div>
          ))}
        </div>

        <div className="row">
          <Button id="ef-deposit-btn" variant="success" full onClick={() => setDepositModal(true)}>↑ Deposit</Button>
          <Button id="ef-withdraw-btn" variant="danger" full onClick={() => setWithdrawModal(true)}>↓ Withdraw</Button>
        </div>
      </div>

      <Modal open={depositModal} onClose={() => setDepositModal(false)} title="Deposit to Emergency Fund">
        <div className="col">
          <div className="input-group">
            <label>Amount (₹)</label>
            <input id="deposit-amount" className="input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="row mt-8">
            <Button onClick={handleDeposit}>Confirm Deposit</Button>
            <Button variant="secondary" onClick={() => { setDepositModal(false); setAmount(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={withdrawModal} onClose={() => setWithdrawModal(false)} title="Withdraw from Emergency Fund">
        <div className="col">
          <p className="text-muted">Available: ₹{balance.toLocaleString()}</p>
          <div className="input-group">
            <label>Amount (₹)</label>
            <input id="withdraw-amount" className="input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="row mt-8">
            <Button variant="danger" onClick={handleWithdraw}>Confirm Withdrawal</Button>
            <Button variant="secondary" onClick={() => { setWithdrawModal(false); setAmount(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
