import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { GameStore, calendarDays, normalizePlayer } from '../server/gameStore.mjs';

test('shared series, independent players, wrong-move counts and timing averages', async () => {
  let now = Date.parse('2026-10-09T10:00:00Z');
  const game = new GameStore(':memory:', () => now);
  try {
    const first = await game.series('2026-10-09', 'Alice');
    const second = await game.series('2026-10-09', 'Bob');
    assert.deepEqual(first.puzzles, second.puzzles);
    assert.equal(first.puzzles[0].key, undefined);
    const puzzles = game.puzzles(first.date);
    const wrong = new Chess(puzzles[0].fen).moves({ verbose: true }).find((move) => move.lan !== puzzles[0].key);
    for (const [name, move, seconds] of [['Alice', puzzles[0].key, 12], ['Bob', wrong.lan, 20], ['Carol', wrong.lan, 30], ['David', null, 10]]) {
      await game.start(first.date, name, 0, name);
      now += seconds * 1000;
      await game.answer(first.date, name, 0, move, seconds * 1000);
    }
    const { leaderboard, statistics } = game.overall(first.date, true);
    assert.equal(leaderboard.length, 4);
    assert.equal(leaderboard[0].name, 'Alice');
    assert.equal(statistics[0].solved, 1);
    assert.equal(statistics[0].failed, 3);
    assert.equal(statistics[0].skipped, 1);
    assert.equal(statistics[0].averageSeconds, 18);
    assert.equal(statistics[0].averageCorrectSeconds, 12);
    assert.deepEqual(statistics[0].wrongMoves, [{ san: wrong.san, count: 2, seconds: 50, averageSeconds: 25 }]);
    for (let ordinal = 1; ordinal < 6; ordinal++) {
      await game.start(first.date, 'Alice', ordinal, 'Alice');
      now += 1000;
      await game.answer(first.date, 'Alice', ordinal, puzzles[ordinal].key, 1000);
    }
    const finished = await game.series(first.date, 'alice');
    assert.equal(finished.player, 'Alice');
    assert.equal(finished.finished, true);
    assert.equal(finished.canReview, true);
    assert.equal(finished.puzzles[0].key, puzzles[0].key);
    assert.equal(finished.statistics[0].answered, 4);
  } finally { game.close(); }
});

test('reopening preserves time; repeated answers and visits do not duplicate statistics', async () => {
  let now = Date.parse('2026-10-09T12:00:00Z');
  const game = new GameStore(':memory:', () => now);
  try {
    const start = await game.start('2026-10-09', 'Tester', 0, 'visit-one');
    now += 5000;
    await game.start(start.date, 'Tester', 0, 'visit-one');
    await game.start(start.date, 'Tester', 0, 'visit-two');
    assert.equal((await game.series(start.date, 'Tester')).startedAt, start.startedAt);
    const answer = await game.answer(start.date, 'Tester', 0, game.puzzles(start.date)[0].key);
    assert.equal(answer.results[0].seconds, 5);
    assert.equal(answer.results[0].reopened, true);
    await game.answer(start.date, 'Tester', 0, null);
    assert.equal(game.overall(start.date, true).statistics[0].answered, 1);
    await assert.rejects(() => game.start(start.date, 'Tester', 2), /Refresh/);
    await assert.rejects(() => game.answer(start.date, 'Tester', 1, null), /Open the diagram/);
  } finally { game.close(); }
});

test('30-day calendar rotates automatically, pins diagrams and never repeats a position', async () => {
  let now = Date.parse('2026-10-09T23:59:00Z');
  const game = new GameStore(':memory:', () => now);
  try {
    assert.equal(calendarDays(game.today()).length, 30);
    const previous = await game.series('2026-09-10', 'Tester');
    const today = await game.series('2026-10-09', 'Tester');
    await game.start(previous.date, 'Tester', 0);
    now += 120000;
    const next = await game.series('2026-10-10', 'Tester');
    assert.equal(game.catalog('Tester').days[0].date, '2026-10-10');
    assert.equal(game.available(previous.date), false);
    await assert.rejects(() => game.answer(previous.date, 'Tester', 0, null), /closed/);
    assert.equal((await game.series(previous.date, 'Tester')).canReview, true);
    const ids = [...today.puzzles, ...next.puzzles, ...previous.puzzles].map((puzzle) => puzzle.fen);
    assert.equal(new Set(ids).size, 18);
    assert.deepEqual((await game.series(today.date, 'Another player')).puzzles, today.puzzles);
  } finally { game.close(); }
});

test('SQLite retains results and diagrams across server restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ml-store-test-'));
  const path = join(directory, 'game.sqlite');
  let game = new GameStore(path, () => Date.parse('2026-10-09T10:00:00Z'));
  try {
    await game.start('2026-10-09', 'Tester', 0, 'one');
    const answer = await game.answer('2026-10-09', 'Tester', 0, null, 0);
    game.close();
    game = new GameStore(path, () => Date.parse('2026-10-09T10:10:00Z'));
    const restored = await game.series('2026-10-09', 'Tester');
    assert.deepEqual(restored.results, answer.results);
    assert.deepEqual(restored.puzzles, answer.puzzles);
  } finally { game.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('trusted names share identity across casing and reject empty or control characters', () => {
  assert.equal(normalizePlayer(' Alice  Smith ').id, normalizePlayer('alice smith').id);
  assert.throws(() => normalizePlayer('a'));
  assert.throws(() => normalizePlayer('x\u0000y'));
});
