const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export async function sprintRequest(action, data, key = '', signal) {
  const response = await fetch(`${API_BASE_URL}/api/sprint/${action}`, {
    signal,
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Sprint tournament server is unavailable.'); }
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

export const getSprintLeaderboard = (signal, date = '') => sprintRequest(date ? `leaderboard?${new URLSearchParams({ date })}` : 'leaderboard', undefined, '', signal);
export const getSprintPlayerHistory = (name, signal) => sprintRequest(`player?${new URLSearchParams({ name })}`, undefined, '', signal);
