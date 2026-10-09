import { latestSaturday, oldEnough, parseTournamentEntry, rankResults, tournamentTypes } from '../server/tournamentTools.mjs';
import { solutionDraft } from '../server/solutionDraft.mjs';
import { Chess } from 'chess.js';
import { tournamentPdf } from '../server/tournamentPdf.mjs';
import { pdfAssets } from './pdfAssets.js';
import PDFDocumentBrowser from '../node_modules/pdfkit/js/pdfkit.browser.js';
import { verifyPuzzle } from '../server/puzzleTools.mjs';

const DEFAULT_TITLE = 'Solving tournament of Martynas Limontas';
const ALLOWED_ORIGINS = new Set([
  'https://arvydasmockus-arch.github.io',
  'https://ml-mokykla.pages.dev',
  'http://localhost:5173',
  'http://localhost:5174',
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

function cors(request) {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Vary': 'Origin' });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

async function requestData(request) {
  const data = await request.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid request data.');
  return data;
}

function isJudge(request, env) {
  const expected = env.JUDGE_KEY;
  const supplied = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  return typeof expected === 'string' && expected.length > 0 && supplied === expected;
}

async function namedEvent(row) {
  return { ...row, displayTitle: `${row.title} No. ${row.number} — ${row.date.replaceAll('-', '.')}` };
}

async function getEvent(db, id, judge = false) {
  const row = await db.prepare('SELECT * FROM tournaments WHERE id = ?').bind(id).first();
  if (!row || (!judge && row.status !== 'published')) throw new Error('Tournament not found.');
  const showSolutions = judge || Boolean(row.solutions_public);
  const stored = await db.prepare('SELECT * FROM tournament_problems WHERE tournament_id = ? ORDER BY ordinal').bind(id).all();
  const puzzles = (stored.results ?? []).map((item) => {
    const puzzle = JSON.parse(item.puzzle);
    if (!showSolutions) return { ordinal: item.ordinal, fen: puzzle.fen, type: puzzle.type, stipulation: puzzle.stipulation,
      solutions: puzzle.solutions, whiteCount: puzzle.whiteCount, blackCount: puzzle.blackCount };
    const draft = solutionDraft(puzzle);
    return { ...puzzle, ordinal: item.ordinal, scoringNotes: item.scoring_notes,
      solutionDraft: item.solution_draft || draft.text, draftWarnings: judge && !item.solution_draft ? draft.warnings : [] };
  });
  const resultRows = judge || row.results_public
    ? await db.prepare('SELECT * FROM tournament_results WHERE tournament_id = ?').bind(id).all()
    : { results: [] };
  const results = rankResults((resultRows.results ?? []).map((item) => {
    const parsed = { ...item, scores: JSON.parse(item.scores) };
    if (!judge) delete parsed.notes;
    return parsed;
  }));
  let submissions;
  if (judge) {
    const sessions = await db.prepare("SELECT * FROM tournament_sessions WHERE tournament_id = ? AND submitted_at IS NOT NULL ORDER BY submitted_at").bind(id).all();
    submissions = (sessions.results ?? []).map((item) => ({ ...item, answers: JSON.parse(item.answers), minutes: Math.min(120, (item.submitted_at - item.started_at) / 60000) }));
  }
  return { id, number: row.number, title: row.title, displayTitle: (await namedEvent(row)).displayTitle, date: row.date,
    mode: row.mode, status: row.status, solutionsPublic: Boolean(row.solutions_public), resultsPublic: Boolean(row.results_public),
    durationMinutes: 120, puzzles, results, ...(judge ? { submissions } : {}), serverNow: Date.now() };
}

async function playerIdentity(name) {
  if (typeof name !== 'string') throw new Error('Enter a player name.');
  const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  // Player names cannot contain control characters.
  // eslint-disable-next-line no-control-regex
  if (clean.length < 2 || clean.length > 40 || /[\u0000-\u001f\u007f]/.test(clean)) throw new Error('Player names must contain 2–40 characters.');
  const bytes = new TextEncoder().encode(clean.toLocaleLowerCase('en-US'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const id = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
  return { id, name: clean };
}

async function generateTournament(db, data) {
  const mode = data.mode ?? 'training';
  const date = data.date ?? latestSaturday();
  const weekly = Boolean(data.weekly);
  if (!['training', 'competition'].includes(mode)) throw new Error('Invalid tournament mode.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Invalid date.');
  const selected = [];
  const hashes = new Set();
  for (const type of tournamentTypes) {
    const rows = await db.prepare(`SELECT p.puzzle, p.raw, p.checked_at, p.position_hash FROM tournament_pool p
      WHERE p.type = ? AND NOT EXISTS (SELECT 1 FROM tournament_problems t WHERE t.position_hash = p.position_hash)`)
      .bind(type).all();
    const unused = (rows.results ?? []).filter((row) => {
      const puzzle = JSON.parse(row.puzzle);
      return !hashes.has(row.position_hash) && oldEnough(puzzle.publicationDate, date)
        && parseTournamentEntry(JSON.parse(row.raw), row.checked_at) !== null;
    });
    unused.sort(() => Math.random() - 0.5);
    const count = (candidate) => { const puzzle = JSON.parse(candidate.puzzle); return puzzle.whiteCount + puzzle.blackCount; };
    const densityMatters = ['#2', '#3', '#n', 's#n'].includes(type);
    const row = densityMatters ? unused.find((candidate) => count(candidate) >= 20 && count(candidate) <= 25)
      ?? unused.find((candidate) => count(candidate) > 15) : unused[0];
    if (!row) throw new Error(`No unused ${type} candidates are available.`);
    selected.push({ ...JSON.parse(row.puzzle), positionHash: row.position_hash });
    hashes.add(row.position_hash);
  }
  if (selected.filter((puzzle) => puzzle.whiteCount + puzzle.blackCount > 15).length < 4)
    throw new Error('At least four problems must have more than 15 pieces.');
  const id = crypto.randomUUID();
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 140) : '';
  const meta = await db.prepare("SELECT value FROM metadata WHERE key = 'tournament_next_number'").first();
  const number = meta ? JSON.parse(meta.value) : 1;
  const statements = [
    db.prepare(`INSERT INTO tournaments(id, title, date, mode, status, created_at, weekly, number)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, title || DEFAULT_TITLE, date, mode, mode === 'training' ? 'published' : 'draft', Date.now(), Number(weekly), number),
    db.prepare(`INSERT INTO metadata(key, value) VALUES('tournament_next_number', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(number + 1)),
    ...selected.map((puzzle, ordinal) => db.prepare(`INSERT INTO tournament_problems(tournament_id, ordinal, puzzle, position_hash)
      VALUES(?, ?, ?, ?)`).bind(id, ordinal, JSON.stringify(puzzle), puzzle.positionHash)),
  ];
  await db.batch(statements);
  return getEvent(db, id, true);
}

function utcDay(time = Date.now()) { return new Date(time).toISOString().slice(0, 10); }
function calendarDays(today = utcDay()) {
  return Array.from({ length: 30 }, (_, index) => new Date(Date.parse(`${today}T12:00:00Z`) - index * 86400000).toISOString().slice(0, 10));
}

async function getPlayer(db, name) {
  const player = await playerIdentity(name);
  await db.prepare('INSERT OR IGNORE INTO players(id, name) VALUES(?, ?)').bind(player.id, player.name).run();
  return db.prepare('SELECT id, name FROM players WHERE id = ?').bind(player.id).first();
}

async function ensureDaily(db, date) {
  if (!calendarDays().includes(date)) throw new Error('This series is closed.');
  const existing = await db.prepare('SELECT COUNT(*) AS n FROM daily_puzzles WHERE date = ?').bind(date).first();
  if (existing.n === 6) return;
  const chosen = [];
  const positions = new Set();
  while (chosen.length < 6) {
    const rows = await db.prepare(`SELECT id, puzzle, position_hash FROM puzzles p
      WHERE eligible = 1 AND verified = 1 AND position_hash IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM daily_puzzles d WHERE d.position_hash = p.position_hash)
      ORDER BY RANDOM() LIMIT 32`).all();
    let found = false;
    for (const row of rows.results ?? []) {
      if (positions.has(row.position_hash)) continue;
      chosen.push(row); positions.add(row.position_hash); found = true;
      if (chosen.length === 6) break;
    }
    if (!found) throw new Error('Not enough unused verified puzzles are available.');
  }
  const statements = [db.prepare('INSERT OR IGNORE INTO daily(date, created_at) VALUES(?, ?)').bind(date, Date.now()),
    ...chosen.map((row, ordinal) => db.prepare(`INSERT INTO daily_puzzles(date, ordinal, puzzle_id, position_hash)
      VALUES(?, ?, ?, ?)`).bind(date, ordinal, row.id, row.position_hash))];
  try { await db.batch(statements); }
  catch (error) {
    const count = await db.prepare('SELECT COUNT(*) AS n FROM daily_puzzles WHERE date = ?').bind(date).first();
    if (count.n !== 6) throw error;
  }
}

async function enqueuePuzzleVerification(db, queue, target = 180) {
  const reserve = await db.prepare(`SELECT COUNT(DISTINCT p.position_hash) AS n FROM puzzles p
    WHERE p.eligible = 1 AND p.verified = 1 AND p.position_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM daily_puzzles d WHERE d.position_hash = p.position_hash)`).first();
  const needed = target - reserve.n;
  if (needed <= 0) return 0;
  const rows = await db.prepare(`SELECT p.id FROM puzzles p WHERE p.eligible = 1 AND p.verified = 0
    AND p.position_hash IS NOT NULL AND NOT EXISTS (SELECT 1 FROM daily_puzzles d WHERE d.position_hash = p.position_hash)
    AND NOT EXISTS (SELECT 1 FROM puzzle_verification_queue q WHERE q.puzzle_id = p.id)
    ORDER BY RANDOM() LIMIT ?`).bind(Math.min(needed, 100)).all();
  const candidates = rows.results ?? [];
  if (!candidates.length) return 0;
  const claims = await db.batch(candidates.map((row) => db.prepare('INSERT OR IGNORE INTO puzzle_verification_queue(puzzle_id, enqueued_at) VALUES(?, ?)')
    .bind(row.id, Date.now())));
  const claimed = candidates.filter((_, index) => claims[index]?.meta?.changes > 0);
  if (!claimed.length) return 0;
  try {
    await queue.sendBatch(claimed.map((row) => ({ body: { puzzleId: row.id } })));
    return claimed.length;
  } catch (error) {
    await db.batch(claimed.map((row) => db.prepare('DELETE FROM puzzle_verification_queue WHERE puzzle_id = ?').bind(row.id)));
    throw error;
  }
}

async function verifyPuzzleMessages(batch, db) {
  for (const message of batch.messages) {
    const id = message.body?.puzzleId;
    try {
      if (typeof id !== 'string') throw new Error('Invalid verification message.');
      const row = await db.prepare('SELECT puzzle, verified FROM puzzles WHERE id = ?').bind(id).first();
      if (row && row.verified === 0) {
        let valid = false;
        try { valid = verifyPuzzle(JSON.parse(row.puzzle)); } catch { valid = false; }
        await db.prepare('UPDATE puzzles SET verified = ? WHERE id = ? AND verified = 0').bind(valid ? 1 : -1, id).run();
      }
      await db.prepare('DELETE FROM puzzle_verification_queue WHERE puzzle_id = ?').bind(id).run();
      message.ack();
    } catch {
      message.retry();
    }
  }
}

async function puzzlesForDay(db, date) {
  const rows = await db.prepare(`SELECT p.puzzle FROM daily_puzzles d JOIN puzzles p ON p.id = d.puzzle_id
    WHERE d.date = ? ORDER BY d.ordinal`).bind(date).all();
  return (rows.results ?? []).map((row) => JSON.parse(row.puzzle));
}

async function overall(db, date, includeStatistics = false) {
  const rows = await db.prepare(`SELECT a.*, p.name FROM attempts a JOIN players p ON p.id = a.player_id
    WHERE a.date = ? ORDER BY a.ordinal`).bind(date).all();
  const attempts = rows.results ?? [];
  const groups = new Map();
  for (const row of attempts) {
    if (!groups.has(row.player_id)) groups.set(row.player_id, { id: row.player_id, name: row.name,
      results: Array(6).fill(null), points: 0, seconds: 0, answered: 0 });
    if (row.answered_at === null) continue;
    const group = groups.get(row.player_id);
    group.results[row.ordinal] = { correct: Boolean(row.correct), seconds: row.seconds, reopened: row.reopens > 0 };
    group.points += Number(row.correct); group.seconds += row.seconds; group.answered++;
  }
  const leaderboard = [...groups.values()].sort((a, b) => b.points - a.points || a.seconds - b.seconds || a.name.localeCompare(b.name));
  const statistics = includeStatistics ? Array.from({ length: 6 }, (_, ordinal) => {
    const answered = attempts.filter((row) => row.ordinal === ordinal && row.answered_at !== null);
    const correct = answered.filter((row) => row.correct);
    const skipped = answered.filter((row) => row.move === null);
    const wrong = new Map();
    for (const row of answered.filter((item) => !item.correct && item.move !== null)) {
      const entry = wrong.get(row.san) ?? { san: row.san, count: 0, seconds: 0 };
      entry.count++; entry.seconds += row.seconds; wrong.set(row.san, entry);
    }
    return { ordinal, answered: answered.length, solved: correct.length, failed: answered.length - correct.length,
      skipped: skipped.length, averageSeconds: answered.length ? answered.reduce((sum, row) => sum + row.seconds, 0) / answered.length : null,
      averageCorrectSeconds: correct.length ? correct.reduce((sum, row) => sum + row.seconds, 0) / correct.length : null,
      wrongMoves: [...wrong.values()].map((item) => ({ ...item, averageSeconds: item.seconds / item.count })).sort((a, b) => b.count - a.count) };
  }) : [];
  return { leaderboard, statistics };
}

async function solvingSeries(db, date, name) {
  if (calendarDays().includes(date)) await ensureDaily(db, date);
  const puzzles = await puzzlesForDay(db, date);
  if (puzzles.length !== 6) throw new Error('Series not found.');
  const player = await getPlayer(db, name);
  const rows = await db.prepare('SELECT * FROM attempts WHERE date = ? AND player_id = ? ORDER BY ordinal').bind(date, player.id).all();
  const attempts = rows.results ?? [];
  const results = attempts.filter((row) => row.answered_at !== null).map((row) => ({ ordinal: row.ordinal, move: row.move,
    san: row.san, correct: Boolean(row.correct), seconds: row.seconds, reopened: row.reopens > 0 }));
  const current = attempts.find((row) => row.answered_at === null);
  const finished = results.length === 6;
  const available = calendarDays().includes(date);
  const canReview = finished || !available;
  return { date, player: player.name, playerId: player.id, available, results, startedAt: current?.started_at ?? null,
    finished, canReview, serverNow: Date.now(), puzzles: puzzles.map((puzzle, ordinal) => canReview
      ? { ...puzzle, ordinal } : { id: puzzle.id, fen: puzzle.fen, ordinal }), ...(await overall(db, date, canReview)) };
}

async function solvingApi(request, url, env) {
  const db = env.DB;
  const today = utcDay();
  if (request.method === 'GET' && url.pathname === '/api/solving/catalog') {
    const name = url.searchParams.get('name');
    const player = name ? await getPlayer(db, name) : null;
    const dates = calendarDays(today);
    const placeholders = dates.map(() => '?').join(', ');
    const [answerRows, playerRows] = await Promise.all([
      player ? db.prepare(`SELECT date, COUNT(*) AS answered, SUM(correct) AS points FROM attempts
        WHERE player_id = ? AND answered_at IS NOT NULL AND date IN (${placeholders}) GROUP BY date`).bind(player.id, ...dates).all() : { results: [] },
      db.prepare(`SELECT date, COUNT(DISTINCT player_id) AS players FROM attempts
        WHERE date IN (${placeholders}) GROUP BY date`).bind(...dates).all(),
    ]);
    const answersByDate = new Map((answerRows.results ?? []).map((row) => [row.date, row]));
    const playersByDate = new Map((playerRows.results ?? []).map((row) => [row.date, row.players]));
    const days = dates.map((date) => ({ date, answered: answersByDate.get(date)?.answered ?? 0,
      points: answersByDate.get(date)?.points ?? 0, players: playersByDate.get(date) ?? 0 }));
    const stats = await db.prepare('SELECT COUNT(*) AS total, SUM(raw IS NOT NULL) AS imported, SUM(eligible = 1) AS eligible, SUM(verified = 1) AS verified FROM puzzles').first();
    const expected = await db.prepare("SELECT value FROM metadata WHERE key = 'import_expected'").first();
    const status = await db.prepare("SELECT value FROM metadata WHERE key = 'import_status'").first();
    return json({ days, today, timezone: 'UTC', library: { ...stats, expected: expected ? JSON.parse(expected.value) : 217611,
      importStatus: status ? JSON.parse(status.value) : {} }, serverNow: Date.now() });
  }
  if (request.method === 'GET' && url.pathname === '/api/solving/series') {
    try { return json(await solvingSeries(db, url.searchParams.get('date'), url.searchParams.get('name'))); }
    catch (error) { return json({ error: error.message }, 400); }
  }
  if (request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  let data;
  try { data = await requestData(request); } catch (error) { return json({ error: error.message }, 400); }
  try {
    if (url.pathname === '/api/solving/start') {
      const { date, name, ordinal, visit = crypto.randomUUID() } = data;
      if (!calendarDays().includes(date)) throw new Error('This series is closed.');
      await ensureDaily(db, date);
      const player = await getPlayer(db, name);
      const done = await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE date = ? AND player_id = ? AND answered_at IS NOT NULL').bind(date, player.id).first();
      if (!Number.isInteger(ordinal) || ordinal !== done.n || ordinal >= 6) throw new Error('Refresh the series before continuing.');
      const existing = await db.prepare('SELECT * FROM attempts WHERE date = ? AND player_id = ? AND ordinal = ?').bind(date, player.id, ordinal).first();
      if (!existing) await db.prepare('INSERT INTO attempts(player_id, date, ordinal, started_at) VALUES(?, ?, ?, ?)').bind(player.id, date, ordinal, Date.now()).run();
      const tokenKey = `visit:${player.id}:${date}:${ordinal}`;
      const previous = await db.prepare('SELECT value FROM metadata WHERE key = ?').bind(tokenKey).first();
      if (existing && previous && JSON.parse(previous.value) !== visit)
        await db.prepare('UPDATE attempts SET reopens = reopens + 1 WHERE player_id = ? AND date = ? AND ordinal = ?').bind(player.id, date, ordinal).run();
      await db.prepare(`INSERT INTO metadata(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(tokenKey, JSON.stringify(visit)).run();
      return json(await solvingSeries(db, date, name));
    }
    if (url.pathname === '/api/solving/answer') {
      const { date, name, ordinal, move, elapsedMs } = data;
      if (!calendarDays().includes(date)) throw new Error('This series is closed.');
      const player = await getPlayer(db, name);
      const attempt = await db.prepare('SELECT * FROM attempts WHERE player_id = ? AND date = ? AND ordinal = ?').bind(player.id, date, ordinal).first();
      if (!attempt) throw new Error('Open the diagram before submitting a move.');
      if (attempt.answered_at !== null) return json(await solvingSeries(db, date, name));
      const puzzle = (await puzzlesForDay(db, date))[ordinal];
      if (!puzzle) throw new Error('Invalid problem number.');
      let san = null, lan = null;
      if (move !== null) {
        if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error('Invalid move.');
        const chess = new Chess(puzzle.fen);
        try { const played = chess.move(move); san = played.san; lan = played.lan; }
        catch { throw new Error('Illegal move.'); }
      }
      const serverElapsed = Math.max(0, Date.now() - attempt.started_at);
      const measured = Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= serverElapsed + 3000 ? elapsedMs : serverElapsed;
      await db.prepare(`UPDATE attempts SET answered_at = ?, seconds = ?, move = ?, san = ?, correct = ?
        WHERE player_id = ? AND date = ? AND ordinal = ? AND answered_at IS NULL`)
        .bind(Date.now(), Math.floor(measured / 1000), lan, san, Number(lan === puzzle.key), player.id, date, ordinal).run();
      return json(await solvingSeries(db, date, name));
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) { return json({ error: error.message }, 400); }
}

async function tournamentApi(request, url, env) {
  const db = env.DB;
  const action = url.pathname.slice('/api/tournaments/'.length);
  const judge = isJudge(request, env);
  const privateActions = ['generate', 'settings', 'result', 'delete-result', 'replace', 'judge/login'].includes(action);
  if ((privateActions || url.searchParams.get('judge') === '1') && !judge) return json({ error: 'Judge access required.' }, 401);

  if (request.method === 'GET' && action === 'catalog') {
    const rows = await db.prepare(`SELECT id, number, title, date, mode, status, solutions_public AS solutionsPublic,
      results_public AS resultsPublic, created_at FROM tournaments ${judge ? '' : "WHERE status = 'published'"} ORDER BY date DESC, created_at DESC`).all();
    const tournaments = await Promise.all((rows.results ?? []).map(namedEvent));
    let pool;
    if (judge) pool = (await db.prepare('SELECT type, COUNT(*) AS count FROM tournament_pool GROUP BY type').all()).results ?? [];
    return json({ tournaments, ...(judge ? { pool } : {}), timezone: 'Europe/Vilnius', weeklyHour: 10, serverNow: Date.now() });
  }
  if (request.method === 'GET' && action === 'event') {
    try { return json(await getEvent(db, url.searchParams.get('id'), judge)); }
    catch (error) { return json({ error: error.message }, 404); }
  }
  if (request.method === 'GET' && action === 'pdf') {
    try {
      const event = await getEvent(db, url.searchParams.get('id'), judge);
      const kind = url.searchParams.get('kind');
      if (kind === 'solutions' && !judge && !event.solutionsPublic) throw new Error('Solutions have not been published.');
      if (kind === 'results' && !judge && !event.resultsPublic) throw new Error('Results have not been published.');
      const pdf = await tournamentPdf(event, kind, pdfAssets, PDFDocumentBrowser);
      return new Response(pdf, { headers: { 'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ML-Academy-No-${event.number}-${event.date}-${kind}.pdf"`,
        'Cache-Control': 'no-store' } });
    } catch (error) { return json({ error: error.message }, 400); }
  }
  if (request.method !== 'POST') return json({ error: 'Not found.' }, 404);

  let data;
  try { data = await requestData(request); } catch (error) { return json({ error: error.message }, 400); }
  try {
    if (action === 'judge/login') return json({ authenticated: true });
    if (action === 'generate') return json(await generateTournament(db, data));
    if (action === 'start') {
      await getEvent(db, data.id);
      const player = await playerIdentity(data.name);
      await db.prepare('INSERT OR IGNORE INTO tournament_sessions(id, tournament_id, player_id, name, started_at) VALUES(?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), data.id, player.id, player.name, Date.now()).run();
      const session = await db.prepare('SELECT * FROM tournament_sessions WHERE tournament_id = ? AND player_id = ?').bind(data.id, player.id).first();
      return json({ id: session.id, name: session.name, startedAt: session.started_at, deadline: session.started_at + 7200000,
        submittedAt: session.submitted_at, ...(session.answers ? { answers: JSON.parse(session.answers) } : {}), serverNow: Date.now() });
    }
    if (action === 'submit') {
      await getEvent(db, data.id);
      const session = await db.prepare('SELECT * FROM tournament_sessions WHERE tournament_id = ? AND id = ?').bind(data.id, data.sessionId).first();
      if (!session) throw new Error('Start the session first.');
      if (!Array.isArray(data.answers) || data.answers.length !== 6 || data.answers.some((answer) => typeof answer !== 'string' || answer.length > 10000)) throw new Error('Invalid answers.');
      if (session.submitted_at !== null) throw new Error('Answers already submitted.');
      if (Date.now() > session.started_at + 7200000) throw new Error('The two-hour session has ended.');
      const submittedAt = Date.now();
      await db.prepare('UPDATE tournament_sessions SET answers = ?, submitted_at = ? WHERE id = ?').bind(JSON.stringify(data.answers), submittedAt, data.sessionId).run();
      return json({ submittedAt, minutes: (submittedAt - session.started_at) / 60000, serverNow: Date.now() });
    }
    if (action === 'result') {
      await getEvent(db, data.tournamentId, true);
      const player = await playerIdentity(data.result?.name);
      const result = data.result;
      if (!Array.isArray(result.scores) || result.scores.length !== 6 || result.scores.some((score) => score !== null && (!Number.isFinite(score) || score < 0 || score > 5))) throw new Error('Each score must be between 0 and 5.');
      if (!Number.isFinite(result.minutes) || result.minutes < 0 || result.minutes > 120) throw new Error('Time must be between 0 and 120 minutes.');
      const id = result.id || crypto.randomUUID();
      const existing = result.id ? await db.prepare('SELECT id FROM tournament_results WHERE id = ? AND tournament_id = ?').bind(result.id, data.tournamentId).first() : true;
      if (!existing) throw new Error('Result not found.');
      const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
      await db.prepare(`INSERT INTO tournament_results(id, tournament_id, name, country, category, rating, title, scores, minutes, notes)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, country=excluded.country,
        category=excluded.category, rating=excluded.rating, title=excluded.title, scores=excluded.scores, minutes=excluded.minutes, notes=excluded.notes`)
        .bind(id, data.tournamentId, player.name, text(result.country, 3).toUpperCase(), text(result.category, 12), text(result.rating, 16),
          text(result.title, 16), JSON.stringify(result.scores), result.minutes, text(result.notes, 2000)).run();
      return json(await getEvent(db, data.tournamentId, true));
    }
    if (action === 'settings') {
      const event = await getEvent(db, data.id, true);
      if (data.title !== undefined && (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 140)) throw new Error('Enter a title (max. 140 characters).');
      if (data.status !== undefined && !['draft', 'published'].includes(data.status)) throw new Error('Invalid status.');
      if (event.mode === 'competition' && data.status === 'published' && event.status !== 'published' && !data.judgeReviewed)
        throw new Error('Review the solutions, difficulty and scoring before publishing a competition.');
      if (data.scoringNotes && (!Array.isArray(data.scoringNotes) || data.scoringNotes.length !== 6 || data.scoringNotes.some((note) => typeof note !== 'string' || note.length > 4000))) throw new Error('Invalid scoring notes.');
      if (data.solutionDrafts && (!Array.isArray(data.solutionDrafts) || data.solutionDrafts.length !== 6 || data.solutionDrafts.some((draft) => typeof draft !== 'string' || draft.length > 20000
        || [...draft.matchAll(/\[(\d+(?:[.,]\d+)?)\]/g)].some((match) => Number(match[1].replace(',', '.')) > 5)))) throw new Error('Invalid solution draft or score (maximum 5).');
      const statements = [db.prepare(`UPDATE tournaments SET title = ?, status = ?, solutions_public = ?, results_public = ? WHERE id = ?`)
        .bind(data.title?.trim() ?? event.title, data.status ?? event.status, Number(data.solutionsPublic ?? event.solutionsPublic), Number(data.resultsPublic ?? event.resultsPublic), data.id)];
      if (data.scoringNotes) data.scoringNotes.forEach((note, ordinal) => statements.push(db.prepare('UPDATE tournament_problems SET scoring_notes = ? WHERE tournament_id = ? AND ordinal = ?').bind(note, data.id, ordinal)));
      if (data.solutionDrafts) data.solutionDrafts.forEach((draft, ordinal) => statements.push(db.prepare('UPDATE tournament_problems SET solution_draft = ? WHERE tournament_id = ? AND ordinal = ?').bind(draft, data.id, ordinal)));
      await db.batch(statements);
      return json(await getEvent(db, data.id, true));
    }
    if (action === 'delete-result') {
      await getEvent(db, data.tournamentId, true);
      await db.prepare('DELETE FROM tournament_results WHERE id = ? AND tournament_id = ?').bind(data.resultId, data.tournamentId).run();
      return json(await getEvent(db, data.tournamentId, true));
    }
    if (action === 'replace') {
      const event = await getEvent(db, data.id, true);
      if (event.status !== 'draft') throw new Error('Only unpublished draft problems can be replaced.');
      const [sessions, results] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM tournament_sessions WHERE tournament_id = ?').bind(data.id).first(),
        db.prepare('SELECT COUNT(*) AS n FROM tournament_results WHERE tournament_id = ?').bind(data.id).first(),
      ]);
      if (sessions.n || results.n) throw new Error('Problems cannot be replaced after play or result entry has started.');
      if (!Number.isInteger(data.ordinal) || data.ordinal < 0 || data.ordinal >= 6) throw new Error('Invalid problem number.');
      const type = tournamentTypes[data.ordinal];
      const rows = await db.prepare(`SELECT p.puzzle, p.raw, p.checked_at, p.position_hash FROM tournament_pool p
        WHERE p.type = ? AND NOT EXISTS (SELECT 1 FROM tournament_problems t WHERE t.position_hash = p.position_hash)`).bind(type).all();
      const eligible = (rows.results ?? []).filter((row) => oldEnough(JSON.parse(row.puzzle).publicationDate, event.date)
        && parseTournamentEntry(JSON.parse(row.raw), row.checked_at) !== null);
      eligible.sort(() => Math.random() - 0.5);
      const count = (row) => { const puzzle = JSON.parse(row.puzzle); return puzzle.whiteCount + puzzle.blackCount; };
      const dense = ['#2', '#3', '#n', 's#n'].includes(type);
      const ordered = dense ? [...eligible.filter((row) => count(row) >= 20 && count(row) <= 25),
        ...eligible.filter((row) => count(row) > 15)] : eligible;
      const otherDense = event.puzzles.filter((puzzle) => puzzle.ordinal !== data.ordinal && puzzle.whiteCount + puzzle.blackCount > 15).length;
      const chosen = ordered.find((row) => otherDense + Number(count(row) > 15) >= 4);
      if (!chosen) throw new Error('No unused candidate matches the tournament requirements.');
      await db.prepare(`UPDATE tournament_problems SET puzzle = ?, position_hash = ?, scoring_notes = '', solution_draft = ''
        WHERE tournament_id = ? AND ordinal = ?`).bind(chosen.puzzle, chosen.position_hash, data.id, data.ordinal).run();
      return json(await getEvent(db, data.id, true));
    }
    return json({ error: 'This Cloudflare API action is not implemented yet.' }, 501);
  } catch (error) { return json({ error: error.message }, 400); }
}

export default {
  async fetch(request, env) {
    const headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return json({ ok: true, service: 'ml-academy-api' }, 200, headers);
    if (url.pathname.startsWith('/api/tournaments/')) {
      const response = await tournamentApi(request, url, env);
      for (const [key, value] of headers) response.headers.set(key, value);
      return response;
    }
    if (url.pathname.startsWith('/api/solving/')) {
      const response = await solvingApi(request, url, env);
      for (const [key, value] of headers) response.headers.set(key, value);
      return response;
    }
    return json({ error: 'Not found.' }, 404, headers);
  },
  async scheduled(_controller, env) {
    const date = utcDay();
    await enqueuePuzzleVerification(env.DB, env.PUZZLE_VERIFY_QUEUE);
    try { await ensureDaily(env.DB, date); } catch (error) { console.log('Daily generation is waiting for verified puzzles:', error.message); }
    const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    if (new Date().getUTCDay() === 6 && localHour === 10) {
      const saturday = latestSaturday();
      const exists = await env.DB.prepare(`SELECT id FROM tournaments WHERE (date = ? AND weekly = 1)
        OR (date >= ? AND mode = 'training') LIMIT 1`).bind(saturday, saturday).first();
      if (!exists) await generateTournament(env.DB, { date: saturday, weekly: true, mode: 'training' });
    }
  },
  async queue(batch, env) {
    await verifyPuzzleMessages(batch, env.DB);
  },
};
