import puzzles from './solvingPuzzles.json' with { type: 'json' };

export const STORAGE_KEY = 'ml-mokykla-solving-v1';
export const SERIES_SIZE = 6;
export const puzzleById = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
export const puzzleCount = puzzles.length;

export function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type).value).join('-');
}

export function recentDays(today = todayKey()) {
  const start = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: 30 }, (_, index) => new Date(start - index * 86400000).toISOString().slice(0, 10));
}

export function isAvailable(date, today = todayKey()) {
  return recentDays(today).includes(date);
}

export function dailyPuzzleIds(date) {
  let seed = 2166136261;
  for (const char of date) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  function random() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }
  const ids = puzzles.map((puzzle) => puzzle.id);
  for (let index = ids.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  return ids.slice(0, SERIES_SIZE);
}

export function createSession(date) {
  return { ids: dailyPuzzleIds(date), results: [], startedAt: null, awaitingNext: false, reopens: 0 };
}

export function loadSolvingState(storage) {
  const fallback = { version: 1, name: 'selius', activeDate: null, sessions: {} };
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1 || typeof saved.name !== 'string'
      || !saved.sessions || typeof saved.sessions !== 'object') return fallback;
    const sessions = {};
    for (const [date, session] of Object.entries(saved.sessions)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !session || !Array.isArray(session.ids)
        || session.ids.length !== SERIES_SIZE || new Set(session.ids).size !== SERIES_SIZE
        || !session.ids.every((id) => puzzleById.has(id)) || !Array.isArray(session.results)
        || session.results.length > SERIES_SIZE || !session.results.every((result) => result
          && typeof result.correct === 'boolean' && Number.isFinite(result.seconds) && result.seconds >= 0
          && (result.move === null || (typeof result.move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(result.move))))
        || !(session.startedAt === null || (Number.isFinite(session.startedAt) && session.startedAt > 0))) continue;
      sessions[date] = { ...session, awaitingNext: Boolean(session.awaitingNext), reopens: Math.max(0, Number(session.reopens) || 0) };
    }
    return { version: 1, name: saved.name.trim().slice(0, 40) || 'selius',
      sessions, activeDate: typeof saved.activeDate === 'string' && sessions[saved.activeDate] ? saved.activeDate : null };
  } catch { return fallback; }
}

export function elapsedSeconds(startedAt, now = Date.now()) {
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function totals(results) {
  const points = results.filter((result) => result.correct).length;
  return { points, seconds: results.reduce((sum, result) => sum + result.seconds, 0),
    percent: results.length === SERIES_SIZE ? Math.round(points / SERIES_SIZE * 100) : null };
}

export function recordAnswer(session, move, now = Date.now()) {
  if (session.startedAt === null || session.awaitingNext || session.results.length >= SERIES_SIZE) return session;
  const puzzle = puzzleById.get(session.ids[session.results.length]);
  return { ...session, startedAt: null, awaitingNext: true,
    results: [...session.results, { move, correct: move === puzzle.key,
      seconds: elapsedSeconds(session.startedAt, now), reopened: session.reopens > 0 }], reopens: 0 };
}
