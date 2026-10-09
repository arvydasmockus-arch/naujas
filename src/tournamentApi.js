export async function tournamentRequest(action, { key = '', signal, data, params = {} } = {}) {
  const response = await fetch(`/api/tournaments/${action}?${new URLSearchParams(params)}`, {
    method: data === undefined ? 'GET' : 'POST', signal,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Tournament server is unavailable. Start npm run dev.'); }
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
export async function downloadTournamentPdf(id, kind, key = '') {
  const response = await fetch(`/api/tournaments/pdf?${new URLSearchParams({ id, kind })}`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error); }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
  link.href = url; link.download = filename || `ML-Academy-${kind}.pdf`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
