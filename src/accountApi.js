const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const TOKEN_KEY = 'ml-account-session-v1';

export function accountHeaders() {
  try { const token = sessionStorage.getItem(TOKEN_KEY); return token ? { 'X-Player-Session': token } : {}; }
  catch { return {}; }
}
export function saveAccountSession(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export async function accountRequest(action, data, judgeKey) {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${action}`, {
    method: data === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { ...accountHeaders(), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(judgeKey ? { Authorization: `Bearer ${judgeKey}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Paskyrų serveris nepasiekiamas.'); }
  if (!response.ok) throw new Error(result.error || 'Nepavyko atlikti veiksmo.');
  return result;
}
