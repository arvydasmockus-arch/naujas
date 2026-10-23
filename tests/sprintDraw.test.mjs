import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { drawSprintRows, sprintDrawQuery } from '../server/sprintDraw.mjs';
import { d1Adapter } from '../server/d1Adapter.mjs';

const migration = readFileSync(new URL('../cloudflare/migrations/0012_sprint_draw_pool.sql', import.meta.url), 'utf8');
function setup(size) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE sprint_candidates(id TEXT PRIMARY KEY,puzzle TEXT,position_hash TEXT UNIQUE,pieces INTEGER,publication_date TEXT);
    CREATE TABLE sprint_puzzles(puzzle_id TEXT,position_hash TEXT UNIQUE);
    CREATE TABLE sprint_retired_positions(puzzle_id TEXT,position_hash TEXT PRIMARY KEY);
    CREATE TABLE daily_puzzles(puzzle_id TEXT,position_hash TEXT UNIQUE);
    CREATE TABLE tournament_problems(puzzle TEXT);`);
  const insert = db.prepare('INSERT INTO sprint_candidates VALUES(?,?,?,?,?)');
  for (let i = 1; i <= size; i++) insert.run(String(i), JSON.stringify({ id: String(i) }), `hash-${i}`, 15, '1990-01-01');
  db.exec(migration);
  return db;
}

test('16,468 candidates are selected by indexed slots; no table scan or random SQL sort', async () => {
  const db = setup(16468);
  try {
    const plan = db.prepare('EXPLAIN QUERY PLAN ' + sprintDrawQuery(8)).all(1, 2, 3, 4, 5, 6, 7, 8, '2021-10-23');
    assert.ok(plan.every((row) => !/SCAN |TEMP B-TREE/.test(row.detail)), JSON.stringify(plan));
    const queries = [];
    const adapter = d1Adapter(db);
    const rows = await drawSprintRows({ prepare(sql) { queries.push(sql); return adapter.prepare(sql); } }, '2026-10-23');
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((row) => row.id)).size, 3);
    assert.equal(queries.length, 2, 'One max-slot lookup and one batch lookup');
    assert.ok(queries.every((sql) => !sql.includes('RANDOM()')));
  } finally { db.close(); }
});

test('used IDs, duplicate positions, young puzzles and small puzzles remain excluded', async () => {
  const db = setup(7);
  try {
    db.prepare('INSERT INTO sprint_puzzles VALUES(?,?)').run('1', 'other-hash');
    db.prepare('INSERT INTO sprint_retired_positions VALUES(?,?)').run('other-id', 'hash-2');
    db.prepare('INSERT INTO daily_puzzles VALUES(?,?)').run('3', 'other-daily');
    db.prepare('INSERT INTO tournament_problems VALUES(?)').run('{"id":"4"}');
    db.prepare('UPDATE sprint_candidates SET publication_date=? WHERE id=?').run('2021-10-24', '5');
    await assert.rejects(drawSprintRows(d1Adapter(db), '2026-10-23'), /reserve needs replenishing/);
    db.prepare('UPDATE sprint_candidates SET publication_date=? WHERE id=?').run('2021-10-23', '5');
    const rows = await drawSprintRows(d1Adapter(db), '2026-10-23');
    assert.deepEqual(rows.map((row) => row.id).sort(), ['5', '6', '7']);
    assert.ok(rows.every((row) => Number(row.id) >= 5));
    db.prepare('UPDATE sprint_candidates SET pieces=14 WHERE id=?').run(rows[0].id);
    await assert.rejects(drawSprintRows(d1Adapter(db), '2026-10-23'), /reserve needs replenishing/);
  } finally { db.close(); }
});

test('migration and imports preserve slots; missing slots and exhausted reserves fail with bounded reads', async () => {
  const db = setup(3);
  try {
    const slots = db.prepare('SELECT * FROM sprint_draw_pool ORDER BY slot').all();
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT * FROM sprint_draw_pool ORDER BY slot').all(), slots);
    db.prepare('INSERT INTO sprint_candidates VALUES(?,?,?,?,?)').run('4', '{"id":"4"}', 'hash-4', 15, '1990-01-01');
    assert.ok(db.prepare('SELECT slot FROM sprint_draw_pool WHERE puzzle_id=?').get('4'));
    db.prepare('DELETE FROM sprint_draw_pool WHERE puzzle_id=?').run('1');
    assert.equal((await drawSprintRows(d1Adapter(db), '2026-10-23')).length, 3);
    db.exec('INSERT INTO sprint_puzzles SELECT id,position_hash FROM sprint_candidates');
    let reads = 0;
    const adapter = d1Adapter(db);
    await assert.rejects(drawSprintRows({ prepare(sql) { reads++; return adapter.prepare(sql); } }, '2026-10-23'), /reserve needs replenishing/);
    assert.ok(reads <= 17);
  } finally { db.close(); }
});
