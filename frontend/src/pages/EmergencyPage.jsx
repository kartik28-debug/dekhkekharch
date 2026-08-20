import { useState, useEffect } from 'react';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { getBufferReserve, depositBufferReserve, withdrawBufferReserve } from '../api/bufferReserve';

export default function EmergencyPage() {
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [depositModal, setDepositModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Manual Expense');

  const TARGET = 30000;

  // 1. Fetch live data
  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getBufferReserve();
      // Checking both keys just in case your backend uses 'balance' instead of 'current_balance'
      setBalance(data.current_balance || data.balance || 0);
      setHistory(data.transactions || []);
    } catch (error) {
      console.error("Failed to fetch buffer reserve:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 2. Deposit Handler
  const handleDeposit = async () => {
    const n = +amount;
    if (n > 0) {
      try {
        await depositBufferReserve(n);
        await loadData();
        setAmount('');
        setDepositModal(false);
      } catch (error) {
        alert("Deposit failed. Check console.");
        console.error(error);
      }
    }
  };

  // 3. Withdraw Handler
  const handleWithdraw = async () => {
    const n = +amount;
    if (n > 0 && n <= balance) {
      try {
        await withdrawBufferReserve(n, reason, 'manual_expense');
        await loadData();
        setAmount('');
        setReason('Manual Expense');
        setWithdrawModal(false);
      } catch (error) {
        alert("Withdrawal failed.");
        console.error(error);
      }
    }
  };

  return (
    <>
      <NavBar title="Buffer Reserve" />
      <div className="page">
        <h1 className="page-title">Buffer Reserve</h1>

        {/* Balance */}
        <div className="balance-box mb-24">
          <p className="balance-label">Current Balance</p>
          <p className="balance-amount green">
            {loading ? "..." : `₹${balance.toLocaleString()}`}
          </p>
          <p className="text-muted mt-8" style={{ fontSize: '0.8rem' }}>
            {balance >= TARGET ? '✅ Target met' : `₹${(TARGET - balance).toLocaleString()} away from ₹30,000 target`}
          </p>
          <div className="progress-bar-track mt-12">
            <div className="progress-bar-fill" style={{ width: `${Math.min((balance / TARGET) * 100, 100)}%` }} />
          </div>
        </div>

        {/* History */}
        <p className="section-label">Recent Activity</p>
        <div className="col mb-24">
          {loading ? (
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>Loading logs...</p>
          ) : history.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>No transactions yet. Start building your buffer!</p>
          ) : (
            history.map((item, i) => {
              const isDeposit = item.type === 'deposit' || item.destination === 'buffer_reserve' || (item.reason && item.reason.toLowerCase().includes('deposit'));
              return (
                <div key={i} className="list-item">
                  <div className="list-item-content">
                    <div className="list-item-title">
                      {item.reason || (isDeposit ? 'Deposit' : 'Withdrawal')}
                    </div>
                    <div className="list-item-sub">
                      {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Recent'}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, color: isDeposit ? 'var(--success)' : 'var(--danger)' }}>
                    {isDeposit ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString()}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Action Buttons */}
        <div className="row">
          <Button id="ef-deposit-btn" variant="success" full onClick={() => setDepositModal(true)}>↑ Deposit Surplus</Button>
          <Button id="ef-withdraw-btn" variant="danger" full onClick={() => setWithdrawModal(true)}>↓ Emergency Withdraw</Button>
        </div>
      </div>

      {/* Deposit Modal */}
      <Modal open={depositModal} onClose={() => setDepositModal(false)} title="Deposit to Buffer Reserve">
        <div className="col">
          <div className="input-group">
            <label>Amount (₹)</label>
            <input className="input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="row mt-8">
            <Button variant="success" onClick={handleDeposit}>Confirm Deposit</Button>
            <Button variant="secondary" onClick={() => { setDepositModal(false); setAmount(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Withdraw Modal */}
      <Modal open={withdrawModal} onClose={() => setWithdrawModal(false)} title="Withdraw from Buffer Reserve">
        <div className="col">
          <p className="text-muted mb-8">Available: ₹{balance.toLocaleString()}</p>
          <div className="input-group">
            <label>Amount (₹)</label>
            <input className="input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="input-group mt-8">
            <label>Reason</label>
            <input className="input" type="text" placeholder="e.g. Medical, Car repair" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="row mt-16">
            <Button variant="danger" onClick={handleWithdraw}>Confirm Withdrawal</Button>
            <Button variant="secondary" onClick={() => { setWithdrawModal(false); setAmount(''); setReason('Manual Expense'); }}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}