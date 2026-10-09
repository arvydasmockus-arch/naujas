async function request(path, options = {}) {
  const response = await fetch(`/api/solving/${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('SOLVING_SERVER_UNAVAILABLE'); }
  if (!response.ok) throw new Error(data.error || 'SOLVING_SERVER_UNAVAILABLE');
  return data;
}

export const getSolvingCatalog = (name, signal) => request(`catalog?${new URLSearchParams({ name })}`, { signal });
export const getSolvingSeries = (date, name, signal) => request(`series?${new URLSearchParams({ date, name })}`, { signal });
export const startSolvingProblem = (data) => request('start', { method: 'POST', body: JSON.stringify(data) });
export const submitSolvingAnswer = (data) => request('answer', { method: 'POST', body: JSON.stringify(data) });
