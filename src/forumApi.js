import { accountHeaders } from './accountApi';
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
export async function forumRequest(action, data, judgeKey = '', signal) {
  const response = await fetch(`${base}/api/forum/${action}`, {
    method: data === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
    headers: { ...accountHeaders(), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(judgeKey ? { Authorization: `Bearer ${judgeKey}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('FORUM_UNAVAILABLE'); }
  if (!response.ok) throw new Error(result.error || 'FORUM_UNAVAILABLE');
  return result;
}
