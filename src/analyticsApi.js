import { accountHeaders } from './accountApi';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export async function trackPageView(section) {
  try {
    await fetch(`${API_BASE_URL}/api/analytics/visit`, {
      method: 'POST', headers: { ...accountHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ section }), keepalive: true,
    });
  } catch { /* Analytics must never block the page. */ }
}

export async function getAnalyticsSummary(key, days = 90) {
  const response = await fetch(`${API_BASE_URL}/api/analytics/summary?days=${days}`, {
    headers: { ...accountHeaders(), ...(key ? { Authorization: `Bearer ${key}` } : {}) }, cache: 'no-store',
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Statistikos serveris nepasiekiamas. Bandykite vėliau.'); }
  if (!response.ok) throw new Error(data.error || 'Could not load analytics.');
  return data;
}
