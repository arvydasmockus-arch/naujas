import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { SprintStore } from '../server/sprintStore.mjs';
import { parseEntry } from '../server/puzzleTools.mjs';
import { parseTournamentEntry } from '../server/tournamentTools.mjs';
import { localSprintDate } from '../server/sprintSelection.mjs';

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
    for (const action of ['catalog', 'round', 'generate', 'regenerate', 'delete-player', 'delete-session']) {
      const response = await request('/api/sprint/judge/' + action, ['catalog', 'round'].includes(action) ? undefined : {}, false);
      assert.equal(response.status, 401);
    }
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
