export async function trackPageView(section) {
  try {
    await fetch('/api/analytics/visit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section }), keepalive: true,
    });
  } catch { /* Analytics must never block the page. */ }
}

export async function getAnalyticsSummary(key, days = 90) {
  const response = await fetch(`/api/analytics/summary?days=${days}`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {}, cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load analytics.');
  return data;
}
