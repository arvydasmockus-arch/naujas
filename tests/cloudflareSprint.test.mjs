import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { SprintStore } from '../server/sprintStore.mjs';
import { parseEntry } from '../server/puzzleTools.mjs';
import { parseTournamentEntry } from '../server/tournamentTools.mjs';
import { localSprintDate } from '../server/sprintSelection.mjs';
import { normalizePlayer } from '../server/gameStore.mjs';

// PDF binary assets are unrelated to these API tests and require Wrangler's loader.
const url = new URL('../cloudflare/worker.js', import.meta.url);
let source = readFileSync(url, 'utf8').replace("import { pdfAssets } from './pdfAssets.js';", 'const pdfAssets = {};');
source = source.replace(/from '([^']+)'/g, (_, path) => `from '${path.startsWith('.') ? new URL(path, url).href : import.meta.resolve(path)}'`);
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function setup() {
  const db = openDatabase(':memory:', false);
  new TournamentStore(db); new SprintStore(db);
  db.exec(readFileSync(new URL('../cloudflare/migrations/0010_sprint_candidates.sql', import.meta.url), 'utf8'));
  const adapter = {
    prepare(sql) {
      let params = [];
      return { bind(...values) { params = values; return this; },
        async first() { return db.prepare(sql).get(...params) ?? null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { const result = db.prepare(sql).run(...params); return { meta: { changes: result.changes, rows_written: result.changes } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  async function request(path, data, authenticated = true) {
    return worker.fetch(new Request('https://example.test' + path, {
      method: data === undefined ? 'GET' : 'POST', headers: { ...(authenticated ? { Authorization: 'Bearer test-access' } : {}), 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }), { DB: adapter, JUDGE_KEY: 'test-access' });
  }
  return { db, request };
}

test('Cloudflare judge endpoints reject unauthenticated reads and mutations', async () => {
  const { db, request } = setup();
  try {
    for (const action of ['catalog', 'round', 'generate', 'regenerate', 'delete-player', 'delete-session', 'delete']) {
      const response = await request('/api/sprint/judge/' + action, ['catalog', 'round'].includes(action) ? undefined : {}, false);
      assert.equal(response.status, 401);
    }
  } finally { db.close(); }
});

test('public Cloudflare sprint statistics expose completed results and three-problem player history', async () => {
  const { db, request } = setup();
  try {
    const player = normalizePlayer('Alice');
    db.prepare('INSERT INTO players(id,name) VALUES(?,?)').run(player.id, player.name);
    for (const date of ['2026-10-11', '2026-10-12']) {
      db.prepare('INSERT INTO sprint_days(date,created_at) VALUES(?,?)').run(date, 1000);
      db.prepare('INSERT INTO sprint_sessions(id,date,player_id,name,started_at,submitted_at,answers,scores,problem_seconds,points,elapsed_seconds) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(date, date, player.id, player.name, 1000, date.endsWith('11') ? 2000 : null,
          '["e4","Nf3",""]', '[1,0,0]', '[30,50,90]', 1, 90);
    }
    const rows = await (await request('/api/sprint/leaderboard', undefined, false)).json();
    assert.equal(rows.rows[0].testsPlayed, 1);
    assert.equal(rows.rows[0].problems, 2);
    assert.equal(rows.rows[0].wrongMoves, 1);
    assert.equal(rows.rows[0].averageSeconds, 45);
    assert.equal(rows.rows[0].success, 50);
    const history = await (await request('/api/sprint/player?name=ALICE', undefined, false)).json();
    assert.equal(history.days.length, 1);
    assert.equal(history.days[0].results.length, 3);
    assert.equal(history.days[0].results[2], null);
    assert.equal(history.days[0].totalSeconds, 90);
    const other = normalizePlayer('Bob');
    db.prepare('INSERT INTO players(id,name) VALUES(?,?)').run(other.id, other.name);
    db.prepare('INSERT INTO sprint_sessions(id,date,player_id,name,started_at,submitted_at,answers,scores,problem_seconds,points,elapsed_seconds) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run('bob-result', '2026-10-11', other.id, other.name, 1000, 2000, '["Nf3","",""]', '[0,0,0]', '[20,30,30]', 0, 30);
    const day = await (await request('/api/sprint/leaderboard?date=2026-10-11', undefined, false)).json();
    assert.equal(day.rows.length, 2);
    assert.equal(day.rows[0].name, 'Alice');
    assert.equal(day.rows[0].success, 33.33);
    assert.equal(day.rows[1].name, 'Bob');
    assert.equal(day.rows[1].problems, 1);
    assert.equal(day.rows[1].totalSeconds, 30);
    assert.deepEqual((await (await request('/api/sprint/leaderboard?date=2026-10-12', undefined, false)).json()).rows, []);
    assert.equal((await request('/api/sprint/leaderboard?date=2026-02-30', undefined, false)).status, 400);
  } finally { db.close(); }
});

test('Cloudflare deletes the selected round, preserves other results and never restores it automatically', async () => {
  const { db, request } = setup();
  try {
    const today = localSprintDate();
    const previous = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    const raw = { id: 100, stipulation: '#2', algebraic: { white: ['Ke1', 'Pe2'], black: ['Ke8'] }, solution: '1.e2-e4 !' };
    const puzzle = parseEntry(raw);
    db.prepare('INSERT INTO players(id,name) VALUES(?,?)').run('p1', 'Player');
    for (const date of [today, previous]) {
      db.prepare('INSERT INTO sprint_days(date,created_at) VALUES(?,?)').run(date, 1000);
      for (let ordinal = 0; ordinal < 3; ordinal++) db.prepare('INSERT INTO sprint_puzzles(date,ordinal,puzzle_id,puzzle,position_hash,pieces,alternative_moves) VALUES(?,?,?,?,?,?,?)')
        .run(date, ordinal, date + ordinal, JSON.stringify({ ...puzzle, id: date + ordinal }), date + ordinal, 3, 0);
      db.prepare('INSERT INTO sprint_sessions(id,date,player_id,name,started_at,submitted_at,answers,scores,points,elapsed_seconds) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(date, date, 'p1', 'Player', 1000, 2000, '["","",""]', '[0,0,0]', 0, 1);
    }
    assert.equal((await request('/api/sprint/judge/delete', { date: today, revision: 1000 })).status, 400);
    assert.equal((await request('/api/sprint/judge/delete', { date: today, revision: 999, confirmed: true })).status, 400);
    assert.equal((await request('/api/sprint/judge/delete', { date: today, revision: 1000, confirmed: true })).status, 200);
    const calendar = await (await request('/api/sprint/calendar')).json();
    assert.deepEqual(calendar.dates, [previous]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sprint_retired_positions').get().n, 3);
    assert.equal(db.prepare('SELECT count(*) AS n FROM sprint_sessions WHERE date=?').get(previous).n, 1);
    assert.equal((await request('/api/sprint/round?date=' + today)).status, 400);
    assert.equal((await request('/api/sprint/start', { date: today, name: 'Player' })).status, 400);
    assert.equal((await (await request('/api/sprint/round')).json()).date, previous);
    await request('/api/admin/import', { sprintRounds: [{ date: today, puzzles: [{}, {}, {}], sessions: [], created_at: 1000 }] });
    assert.equal(db.prepare('SELECT count(*) AS n FROM sprint_days WHERE date=?').get(today).n, 0);
  } finally { db.close(); }
});

test('Cloudflare imports checked candidates and schedules future rounds without source scans', async () => {
  const { db, request } = setup();
  try {
    const white = ['Ke1', 'Qd1', 'Ra1', 'Rh1', 'Bc1', 'Bf1', 'Sb1', 'Sg1', 'Pa2', 'Pb2', 'Pc2', 'Pd2', 'Pe2', 'Pf2', 'Pg2', 'Ph2'];
    const black = ['Ke8', 'Qd8', 'Ra8', 'Rh8', 'Bc8', 'Bf8', 'Sb8', 'Sg8', 'Pa7', 'Pb7', 'Pc7', 'Pd7', 'Pe7', 'Pf7', 'Pg7', 'Ph7'];
    const candidates = Array.from({ length: 3 }, (_, index) => {
      const pieces = white.map((piece) => index === 1 && piece === 'Sb1' ? 'Sa3' : index === 2 && piece === 'Sg1' ? 'Sh3' : piece);
      const raw = { id: 90000 + index, stipulation: '#2', algebraic: { white: pieces, black }, source: { name: 'Test', date: { year: 1990 } }, solution: '1.e2-e4 !' };
      const puzzle = { ...parseTournamentEntry(raw), key: parseEntry(raw).key, alternativeMoves: 20, pieces: 32, wrongKeyTries: index };
      return { id: puzzle.id, puzzle: JSON.stringify(puzzle), position_hash: puzzle.positionHash, pieces: 32, wrong_key_tries: index, publication_date: puzzle.publicationDate };
    });
    assert.equal((await request('/api/admin/import', { sprintCandidates: candidates })).status, 200);
    const date = new Date(Date.parse(localSprintDate() + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    assert.equal((await request('/api/sprint/judge/generate', { date })).status, 200);
    const round = await (await request('/api/sprint/judge/round?date=' + date)).json();
    assert.equal(round.puzzles.length, 3);
    assert.equal(round.puzzles[0].id, '90002');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM puzzles').get().n, 0);
    assert.equal((await request('/api/sprint/round?date=' + date)).status, 400);
  } finally { db.close(); }
});

test('automatic import accounts for retries, rejects defects in batches and stops at its daily allowance', async () => {
  const { db, request } = setup();
  try {
    const key = 'automatic_puzzle_import:' + new Date().toISOString().slice(0, 10);
    assert.equal((await request('/api/admin/import', { automaticImportStatus: true }, false)).status, 401);
    assert.equal((await (await request('/api/admin/import', { automaticImportStatus: true })).json()).remaining, 95000);
    const row = { id: 'auto-1', raw: '{}', puzzle: null, eligible: 0, verified: 0 };
    assert.equal((await request('/api/admin/import', { automatic: true, puzzles: [row] })).status, 200);
    assert.equal(Number(db.prepare('SELECT value FROM metadata WHERE key=?').get(key).value), 5);
    await request('/api/admin/import', { automatic: true, puzzles: [row] });
    assert.equal(db.prepare('SELECT count(*) AS n FROM puzzles').get().n, 1);
    assert.equal(Number(db.prepare('SELECT value FROM metadata WHERE key=?').get(key).value), 9);
    assert.equal((await request('/api/admin/import', { automatic: true, puzzles: [{ ...row, raw: 123 }] })).status, 400);
    assert.equal(Number(db.prepare('SELECT value FROM metadata WHERE key=?').get(key).value), 9);
    db.prepare('UPDATE metadata SET value=? WHERE key=?').run('94996', key);
    const paused = await (await request('/api/admin/import', { automatic: true, puzzles: [{ ...row, id: 'auto-2' }] })).json();
    assert.equal(paused.paused, true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM puzzles').get().n, 1);
  } finally { db.close(); }
});

test('failed automatic batches retain a reservation and a new UTC day gets its own allowance', async () => {
  const { db, request } = setup();
  try {
    db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run('automatic_puzzle_import:2000-01-01', '95000');
    assert.equal((await (await request('/api/admin/import', { automaticImportStatus: true })).json()).written, 0);
    db.exec("CREATE TRIGGER reject_import BEFORE INSERT ON puzzles BEGIN SELECT RAISE(ABORT,'test interruption'); END;");
    await assert.rejects(request('/api/admin/import', { automatic: true, puzzles: [{ id: 'failed', raw: '{}', puzzle: null }] }));
    assert.equal((await (await request('/api/admin/import', { automaticImportStatus: true })).json()).written, 8);
    assert.equal(db.prepare('SELECT count(*) AS n FROM puzzles').get().n, 0);
  } finally { db.close(); }
});
