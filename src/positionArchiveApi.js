import { API_BASE_URL } from './apiBaseUrl';
import { accountHeaders } from './accountApi';

export async function positionArchiveRequest(method = 'GET', data, id, key = '') {
  const endpoint = id === 'shared' ? '/api/positions/shared' : id ? `/api/positions/${encodeURIComponent(id)}` : '/api/positions';
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    cache: 'no-store',
    headers: { ...accountHeaders(), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Nepavyko perskaityti archyvo atsakymo.'); }
  if (!response.ok) throw new Error(result.error || 'Nepavyko pasiekti uždavinių archyvo.');
  return result;
}
