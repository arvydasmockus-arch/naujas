import { API_BASE_URL } from './apiBaseUrl';
import { accountHeaders } from './accountApi';

export async function positionArchiveRequest(method = 'GET', data, id) {
  const response = await fetch(`${API_BASE_URL}/api/positions${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method,
    cache: 'no-store',
    headers: { ...accountHeaders(), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Nepavyko perskaityti archyvo atsakymo.'); }
  if (!response.ok) throw new Error(result.error || 'Nepavyko pasiekti uždavinių archyvo.');
  return result;
}
