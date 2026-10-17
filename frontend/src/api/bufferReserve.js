import { apiFetchJson } from './client';

const BASE = '/api/buffer-reserve';

export const getBufferReserve = async () => {
  return apiFetchJson(`${BASE}/`);
};

export const depositBufferReserve = async (amount) => {
  return apiFetchJson(`${BASE}/deposit/`, {
    method: 'POST',
    body: JSON.stringify({ amount, source: 'dsl_bucket' }),
  });
};

export const withdrawBufferReserve = async (amount, reason = 'Emergency', type = 'manual_expense') => {
  return apiFetchJson(`${BASE}/withdraw/`, {
    method: 'POST',
    body: JSON.stringify({ amount, reason, type }),
  });
};