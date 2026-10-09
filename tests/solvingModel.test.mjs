import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  createSession, dailyPuzzleIds, elapsedSeconds, isAvailable, loadSolvingState,
  puzzleById, recordAnswer, recentDays, todayKey, totals,
} from '../src/solvingModel.js';

test('30 days include today, handle month boundaries, and close day 31', () => {
  const dates = recentDays('2026-03-01');
  assert.equal(dates.length, 30);
  assert.equal(dates[0], '2026-03-01');
  assert.equal(dates.at(-1), '2026-01-31');
  assert.equal(isAvailable('2026-01-30', '2026-03-01'), false);
  assert.equal(isAvailable('2026-03-02', '2026-03-01'), false);
  assert.equal(todayKey(new Date('2026-10-08T22:30:00Z')), '2026-10-09');
});

test('each date has six distinct, deterministic puzzles with legal authored keys', () => {
  for (const date of recentDays('2026-10-09')) {
    const ids = dailyPuzzleIds(date);
    assert.equal(new Set(ids).size, 6);
    assert.deepEqual(ids, dailyPuzzleIds(date));
    for (const id of ids) {
      const puzzle = puzzleById.get(id);
      const chess = new Chess(puzzle.fen);
      assert.ok(chess.move(puzzle.key));
    }
  }
});

test('correct, incorrect, and skipped answers retain all elapsed seconds; duplicate submission is ignored', () => {
  let session = { ...createSession('2026-10-09'), startedAt: 1000 };
  const key = puzzleById.get(session.ids[0]).key;
  session = recordAnswer(session, key, 5100);
  assert.equal(session.results[0].correct, true);
  assert.equal(session.results[0].seconds, 4);
  assert.equal(recordAnswer(session, key, 6000), session);
  session = { ...session, awaitingNext: false, startedAt: 6000 };
  session = recordAnswer(session, 'a1a2', 9000);
  session = { ...session, awaitingNext: false, startedAt: 10000 };
  session = recordAnswer(session, null, 12000);
  assert.deepEqual(totals(session.results), { points: 1, seconds: 9, percent: null });
  assert.equal(elapsedSeconds(10000, 9000), 0);
});

test('reload preserves the original timer, answers, and locked daily puzzle order', () => {
  const session = { ...createSession('2026-10-09'), startedAt: 12345 };
  const state = { version: 1, name: 'selius', activeDate: '2026-10-09', sessions: { '2026-10-09': session } };
  const loaded = loadSolvingState({ getItem: () => JSON.stringify(state) });
  assert.equal(loaded.sessions['2026-10-09'].startedAt, 12345);
  assert.deepEqual(loaded.sessions['2026-10-09'].ids, session.ids);
  assert.equal(elapsedSeconds(loaded.sessions['2026-10-09'].startedAt, 22345), 10);
});

test('invalid storage does not crash the page or restore corrupt series', () => {
  assert.equal(loadSolvingState({ getItem: () => '{bad json' }).activeDate, null);
  const invalid = { version: 1, name: 'solver', sessions: { '2026-10-09': { ids: ['missing'], results: [] } } };
  assert.deepEqual(loadSolvingState({ getItem: () => JSON.stringify(invalid) }).sessions, {});
  assert.equal(loadSolvingState({ getItem: () => { throw new Error('Denied'); } }).name, 'selius');
});

test('six completed answers produce percentages and cannot be submitted again', () => {
  let session = createSession('2026-10-09');
  for (let index = 0; index < 6; index++) {
    session = { ...session, awaitingNext: false, startedAt: 1000 };
    session = recordAnswer(session, puzzleById.get(session.ids[index]).key, 6000);
  }
  assert.deepEqual(totals(session.results), { points: 6, seconds: 30, percent: 100 });
  assert.equal(recordAnswer({ ...session, awaitingNext: false }, 'a1a2', 7000).results.length, 6);
});
