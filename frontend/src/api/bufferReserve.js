const BASE = '/api/buffer-reserve';

export const getBufferReserve = async () => {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const depositBufferReserve = async (amount) => {
  const res = await fetch(`${BASE}/deposit/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, source: 'dsl_bucket' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const withdrawBufferReserve = async (amount, reason = 'Emergency', type = 'manual_expense') => {
  const res = await fetch(`${BASE}/withdraw/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, reason, type }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};