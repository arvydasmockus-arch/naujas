import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { parseTournamentEntry } from '../server/tournamentTools.mjs';
import { parseEntry } from '../server/puzzleTools.mjs';
import { sprintCandidates, verifySprintPuzzle } from '../server/sprintSelection.mjs';
import { countWrongKeyTries, selectSprintPuzzles, SprintStore, SPRINT_DURATION_MS, localSprintDate } from '../server/sprintStore.mjs';

const startPositions = [
  ['Ke1', 'Qd1', 'Ra1', 'Rh1', 'Bc1', 'Bf1', 'Sb1', 'Sg1', 'Pa2', 'Pb2', 'Pc2', 'Pd2', 'Pe2', 'Pf2', 'Pg2', 'Ph2'],
  ['Ke1', 'Qd1', 'Ra1', 'Rh1', 'Bc1', 'Bf1', 'Sa3', 'Sg1', 'Pa2', 'Pb2', 'Pc2', 'Pd2', 'Pe2', 'Pf2', 'Pg2', 'Ph2'],
  ['Ke1', 'Qd1', 'Ra1', 'Rh1', 'Bc1', 'Bf1', 'Sb1', 'Sh3', 'Pa2', 'Pb2', 'Pc2', 'Pd2', 'Pe2', 'Pf2', 'Pg2', 'Ph2'],
];
const black = ['Ke8', 'Qd8', 'Ra8', 'Rh8', 'Bc8', 'Bf8', 'Sb8', 'Sg8', 'Pa7', 'Pb7', 'Pc7', 'Pd7', 'Pe7', 'Pf7', 'Pg7', 'Ph7'];
function entry(id, white) {
  return { id, authors: ['Test composer'], source: { name: 'Test publication', date: { year: 1990, month: 1, day: 1 } },
    algebraic: { white, black }, stipulation: '#2', solution: '1.e2-e4 !\n 1...a7-a6\n 2.Qd1-h5 #', keywords: [] };
}
function setup() {
  let now = Date.parse('2026-10-12T16:00:00Z');
  const db = openDatabase(':memory:', false);
  new TournamentStore(db);
  const store = new SprintStore(db, () => now, () => true);
  const save = db.prepare('INSERT INTO puzzles(id,raw,puzzle,eligible,verified,position_hash) VALUES(?,?,?,1,0,?)');
  startPositions.forEach((white, index) => {
    const raw = entry(String(90000 + index), white);
    const puzzle = parseTournamentEntry(raw, '2026-10-12T12:00:00.000Z');
    assert.ok(puzzle);
    const parsed = parseEntry(raw);
    save.run(puzzle.id, JSON.stringify(raw), JSON.stringify(parsed), parsed.positionHash);
  });
  return { db, store, advance: (milliseconds) => { now += milliseconds; } };
}

function addJudgeCandidates(db) {
  const save = db.prepare('INSERT INTO puzzles(id,raw,puzzle,eligible,verified,position_hash) VALUES(?,?,?,1,0,?)');
  for (let mask = 1; mask < 16; mask++) {
    const raw = entry(String(91000 + mask), startPositions[0]);
    raw.algebraic = { ...raw.algebraic, black: black.map((piece) => {
      const index = ['Pa7', 'Pb7', 'Pc7', 'Pd7'].indexOf(piece);
      return index >= 0 && (mask & (1 << index)) ? piece.replace('7', '6') : piece;
    }) };
    const parsed = parseEntry(raw);
    save.run(parsed.id, JSON.stringify(raw), JSON.stringify(parsed), parsed.positionHash);
  }
}

test('judge deletes one complete round, keeps other dates and prevents automatic recreation', () => {
  const { db, store } = setup();
  try {
    addJudgeCandidates(db);
    const previous = '2026-10-11';
    store.generate(previous);
    const earlier = store.start('Alice', previous);
    store.submit(earlier.id, ['', '', '']);
    const current = store.start('Alice');
    store.submit(current.id, ['e4', '', '']);
    const day = store.judgeRound(store.today());
    assert.throws(() => store.deleteRound({ date: day.date, revision: day.revision }), /Confirm deleting/);
    assert.throws(() => store.deleteRound({ date: day.date, revision: day.revision - 1, confirmed: true }), /Tournament changed/);
    assert.equal(store.judgeRound(day.date).sessions.length, 1);
    store.deleteRound({ date: day.date, revision: day.revision, confirmed: true });
    assert.deepEqual(store.calendar('Alice').dates, [previous]);
    assert.deepEqual(store.calendar('Alice').completedDates, [previous]);
    assert.equal(store.restore('Alice', day.date).session, null);
    assert.throws(() => store.start('Alice', day.date), /Tournament not found/);
    assert.throws(() => store.round(day.date), /Tournament not found/);
    assert.equal(store.round().date, previous);
    assert.equal(store.judgeRound(previous).sessions[0].id, earlier.id);
    const reopened = new SprintStore(db, store.clock, () => true);
    assert.deepEqual(reopened.calendar().dates, [previous]);
    store.generate(day.date);
    const replacement = store.judgeRound(day.date);
    assert.equal(replacement.puzzles.length, 3);
    assert.equal(replacement.sessions.length, 0);
    assert.ok(replacement.puzzles.every((puzzle) => !day.puzzles.some((old) => old.id === puzzle.id)));
  } finally { db.close(); }
});

test('all-time sprint statistics match solving counts and use only answered problem times', () => {
  const { db, store, advance } = setup();
  try {
    addJudgeCandidates(db);
    store.generate('2026-10-11');
    const previous = store.start('Alice', '2026-10-11');
    advance(120000); store.submit(previous.id, ['e4', 'Nf3', '']);
    const current = store.start('Alice');
    const bob = store.start('Bob');
    advance(180000); store.submit(current.id, ['e4', 'e4', 'Nf3'], [30, 100, 150]);
    const rows = store.statisticsLeaderboard();
    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0], id: undefined }, { id: undefined, name: 'Alice', testsPlayed: 2,
      problems: 5, correct: 3, wrongMoves: 2, totalSeconds: 520, averageSeconds: 104, success: 60 });
    const history = store.playerHistory('  ALICE  ');
    assert.deepEqual(history.days.map((day) => day.date), ['2026-10-12', '2026-10-11']);
    assert.equal(history.days[0].points, 2);
    assert.equal(history.days[0].totalSeconds, 280);
    assert.deepEqual(history.days[0].results.map((result) => result.seconds), [30, 100, 150]);
    assert.equal(history.days[1].results[2], null);
    assert.deepEqual(store.playerHistory('Bob').days, []);
    assert.deepEqual(store.playerHistory('Unknown').days, []);
    store.submit(bob.id, ['', '', '']);
    const blank = store.statisticsLeaderboard().find((row) => row.name === 'Bob');
    assert.equal(blank.testsPlayed, 1);
    assert.equal(blank.problems, 0);
    assert.equal(blank.totalSeconds, 0);
    assert.equal(blank.averageSeconds, 0);
    assert.equal(blank.success, 0);
    assert.deepEqual(store.playerHistory('Bob').days[0].results, [null, null, null]);
    const previousRows = store.statisticsLeaderboard('2026-10-11');
    assert.equal(previousRows.length, 1);
    assert.equal(previousRows[0].testsPlayed, 1);
    assert.equal(previousRows[0].problems, 2);
    assert.equal(previousRows[0].correct, 1);
    assert.equal(previousRows[0].totalSeconds, 240);
    assert.equal(previousRows[0].success, 50);
    const todayRows = store.statisticsLeaderboard('2026-10-12');
    assert.equal(todayRows.length, 2);
    assert.equal(todayRows[0].correct, 2);
    assert.equal(todayRows[0].totalSeconds, 280);
    assert.equal(todayRows[0].success, 66.67);
    assert.deepEqual(store.statisticsLeaderboard('2026-10-10'), []);
    assert.throws(() => store.statisticsLeaderboard('2026-02-30'), /Invalid statistics date/);
  } finally { db.close(); }
});

test('judge schedules future rounds privately and does not overwrite existing dates', () => {
  const { db, store } = setup();
  try {
    addJudgeCandidates(db);
    store.round();
    const generated = store.generate('2026-10-13');
    assert.equal(generated.created, true);
    const before = store.judgeRound(generated.date);
    assert.equal(store.generate(generated.date).created, false);
    assert.deepEqual(store.judgeRound(generated.date), before);
    assert.ok(store.judgeCatalog().rounds.some((round) => round.date === generated.date));
    assert.ok(!store.calendar().dates.includes(generated.date));
    assert.throws(() => store.round(generated.date), /not available yet/);
    assert.throws(() => store.generate('2026-02-30'), /Invalid tournament date/);
  } finally { db.close(); }
});

test('judge regeneration requires explicit result reset, retires old positions and preserves data on failure', () => {
  const { db, store } = setup();
  try {
    addJudgeCandidates(db);
    const alice = store.start('Alice');
    store.submit(alice.id, ['e4', '', '']);
    const original = store.judgeRound(store.today());
    assert.throws(() => store.regenerate({ date: original.date, revision: original.revision }), /Players have already started/);
    const changed = store.regenerate({ date: original.date, revision: original.revision, resetResults: true });
    assert.ok(changed.revision > original.revision);
    assert.equal(changed.sessions.length, 0);
    assert.ok(changed.puzzles.every((puzzle) => !original.puzzles.some((old) => old.id === puzzle.id)));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprint_retired_positions').get().n, 3);
    assert.equal(store.restore('Alice', original.date).session, null);
    assert.equal(store.round(original.date, alice.id).sessionStatus, 'missing');
    assert.throws(() => store.regenerate({ date: original.date, revision: original.revision, resetResults: true }), /Tournament changed/);
    store.validate = () => false;
    assert.throws(() => store.regenerate({ date: changed.date, revision: changed.revision }), /Only 0 currently qualify/);
    assert.deepEqual(store.judgeRound(changed.date), changed);
  } finally { db.close(); }
});

test('judge can delete one result or all sprint sessions for a player without deleting shared players', () => {
  const { db, store } = setup();
  try {
    const alice = store.start('Alice');
    const bob = store.start('Bob');
    store.submit(alice.id, ['e4', '', '']); store.submit(bob.id, ['', '', '']);
    assert.equal(store.deleteSession(alice.id).deleted, 1);
    assert.deepEqual(store.calendar('Alice').completedDates, []);
    assert.equal(store.restore('Alice', store.today()).session, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprint_sessions').get().n, 1);
    const player = store.judgeCatalog().players.find((item) => item.name === 'Bob');
    assert.equal(store.deletePlayer(player.id).deleted, 1);
    assert.ok(db.prepare('SELECT id FROM players WHERE id=?').get(player.id));
    assert.equal(store.judgeCatalog().players.length, 0);
  } finally { db.close(); }
});

test('Vilnius sprint date changes at local midnight, including the summer offset', () => {
  assert.equal(localSprintDate(Date.parse('2026-10-12T20:30:00Z')), '2026-10-12');
  assert.equal(localSprintDate(Date.parse('2026-10-12T22:30:00Z')), '2026-10-13');
  assert.equal(localSprintDate(Date.parse('2026-07-01T20:30:00Z')), '2026-07-01');
  assert.equal(localSprintDate(Date.parse('2026-07-01T21:30:00Z')), '2026-07-02');
});

test('daily round reserves three difficult #2s, starts a shared 20-minute session, scores and ranks it', () => {
  const { db, store, advance } = setup();
  try {
    const round = store.round();
    assert.equal(round.puzzles.length, 3);
    assert.ok(round.puzzles.every((puzzle) => puzzle.pieces >= 20 && puzzle.alternativeMoves >= 12));
    assert.ok(round.puzzles.every((puzzle) => !Object.hasOwn(puzzle, 'key')));
    const alice = store.start('Alice');
    assert.equal(alice.puzzles.map((puzzle) => puzzle.id).join(','), round.puzzles.map((puzzle) => puzzle.id).join(','));
    assert.equal(alice.deadline - alice.startedAt, SPRINT_DURATION_MS);
    assert.equal(store.start('Alice').id, alice.id);
    advance(6 * 60 * 1000);
    const result = store.submit(alice.id, ['e4', 'e4', 'e4']);
    assert.deepEqual(result.scores, [1, 1, 1]);
    assert.equal(result.points, 3);
    assert.equal(result.elapsedSeconds, 360);
    assert.deepEqual(result.problemSeconds, [360, 360, 360]);
    assert.equal(result.reviewPuzzles.length, 3);
    assert.ok(result.reviewPuzzles.every((puzzle) => puzzle.keySan && puzzle.solution));
    assert.equal(result.problemStatistics[0].moves[0].players[0].name, 'Alice');
    assert.equal(Object.hasOwn(store.round().problemStatistics[0], 'moves'), false);
    assert.equal(store.round(undefined, alice.id).problemStatistics[0].moves[0].move, 'e4');
    assert.ok(round.puzzles.every((puzzle) => !Object.hasOwn(puzzle, 'key')));
    assert.equal(store.submit(alice.id, ['', '', '']).points, 3);
    const bob = store.start('Bob');
    assert.equal(Object.hasOwn(store.round(undefined, bob.id).problemStatistics[0], 'moves'), false);
    advance(2 * 60 * 1000);
    assert.equal(store.submit(bob.id, ['Nf3', '', 'bad']).points, 0);
    const rankings = store.round();
    assert.equal(rankings.dailyResults[0].name, 'Alice');
    assert.equal(rankings.dailyResults[0].points, 3);
    assert.deepEqual(rankings.dailyResults[0].results, [true, true, true].map((correct) => ({ correct, answered: true, seconds: 360 })));
    assert.equal(Object.hasOwn(rankings.dailyResults[0], 'answers'), false);
    assert.equal(rankings.overallResults[0].rounds, 1);
    assert.equal(rankings.overallResults[0].averageSeconds, 360);
    assert.deepEqual(rankings.dailyWinners.map((row) => row.name), ['Alice']);
    assert.equal(rankings.problemStatistics[0].solved, 1);
    assert.equal(rankings.problemStatistics[0].failed, 1);
    assert.equal(rankings.problemStatistics[0].skipped, 0);
    assert.equal(rankings.problemStatistics[0].averageSeconds, 240);
    assert.equal(rankings.problemStatistics[0].averageCorrectSeconds, 360);
    assert.deepEqual(rankings.problemStatistics[0].wrongMoves.map(({ move, count, averageSeconds }) => ({ move, count, averageSeconds })),
      [{ move: 'Nf3', count: 1, averageSeconds: 120 }]);
  } finally { db.close(); }
});

test('sprint selection excludes young and defect-labelled puzzles but allows smaller positions', () => {
  const { db, store } = setup();
  try {
    db.prepare("UPDATE puzzles SET raw=json_set(raw,'$.source.date.year',2025) WHERE id='90000'").run();
    db.prepare("UPDATE puzzles SET raw=json_set(raw,'$.keywords',json('[\"cooked\"]')) WHERE id='90001'").run();
    db.prepare("UPDATE puzzles SET raw=json_set(raw,'$.algebraic.white',json('[\"Ke1\",\"Pe2\"]'),'$.algebraic.black',json('[\"Ke8\"]')) WHERE id='90002'").run();
    assert.throws(() => store.round(), /Only 1 currently qualify/);
  } finally { db.close(); }
});

test('sprint selection prioritizes the number of white key tries marked with question marks', () => {
  const { db } = setup();
  try {
    assert.equal(countWrongKeyTries('1.Qa5 ? but\n1.Qb5??\n1.Pe2-e4 !'), 2);
    const update = db.prepare('UPDATE puzzles SET raw=?,puzzle=NULL WHERE id=?');
    for (const [id, solution] of [
      ['90000', '1.a2-a3 ? but\n1.e2-e4 !'],
      ['90001', '1.a2-a3 ? but\n1.b2-b3 ??\n1.e2-e4 !'],
      ['90002', '1.e2-e4 !'],
    ]) {
      const raw = JSON.parse(db.prepare('SELECT raw FROM puzzles WHERE id=?').get(id).raw);
      update.run(JSON.stringify({ ...raw, solution }), id);
    }
    const rows = db.prepare("SELECT p.id,p.raw,p.puzzle FROM puzzles p").all();
    const selected = selectSprintPuzzles(rows, '2026-10-12', () => true);
    assert.deepEqual(selected.map((puzzle) => puzzle.id), ['90001', '90000', '90002']);
    assert.deepEqual(selected.map((puzzle) => puzzle.wrongKeyTries), [2, 1, 0]);
  } finally { db.close(); }
});

test('round timer caps a late submission at 20 minutes', () => {
  const { db, store, advance } = setup();
  try {
    const player = store.start('Late');
    advance(SPRINT_DURATION_MS + 5000);
    assert.equal(store.submit(player.id, ['', '', '']).elapsedSeconds, 1200);
  } finally { db.close(); }
});

test('calendar marks only submitted rounds for the named player and retains the state on reopening', () => {
  const { db, store } = setup();
  try {
    const alice = store.start('Alice');
    const bob = store.start('Bob');
    assert.deepEqual(store.calendar('Alice').completedDates, []);
    store.submit(alice.id, ['e4', '', '']);
    assert.deepEqual(store.calendar('Alice').completedDates, ['2026-10-12']);
    assert.deepEqual(store.calendar('  ALICE  ').completedDates, ['2026-10-12']);
    assert.deepEqual(store.calendar('Bob').completedDates, []);
    assert.deepEqual(store.calendar().completedDates, []);
    assert.deepEqual(store.calendar('Unknown player').completedDates, []);
    const reopened = new SprintStore(db, () => Date.parse('2026-10-12T16:00:00Z'), () => true);
    assert.deepEqual(reopened.calendar('Alice').completedDates, ['2026-10-12']);
    store.submit(bob.id, ['', '', '']);
    assert.deepEqual(store.calendar('Bob').completedDates, ['2026-10-12']);
  } finally { db.close(); }
});


test('piece tiers take precedence, five tries win within a tier, and twins never qualify', () => {
  const make = (id, pieces, tries = 0, extra = {}) => {
    const raw = entry(id, startPositions[0]);
    raw.algebraic = { white: raw.algebraic.white, black: black.slice(0, pieces - 16) };
    raw.solution = Array.from({ length: tries }, (_, i) => '1.Q' + String.fromCharCode(97 + i) + '3 ? refutation').join('\n') + '\n1.e2-e4 !';
    Object.assign(raw, extra);
    const parsed = parseEntry(raw);
    return { id, raw: JSON.stringify(raw), puzzle: JSON.stringify(parsed) };
  };
  const rows = [make('19', 19, 6), make('20', 20), make('21', 21, 5), make('18', 18, 7),
    make('twin', 24, 6, { twins: { a: '', b: 'move pawn' } }),
    make('ab', 24, 6, { solution: 'a) 1.e2-e4 !\nb) 1.d2-d4 !' }),
    make('cook', 24, 6, { comments: ['cooked'] }),
    make('dual', 24, 6, { keywords: ['Dual'] }),
    make('multiple', 24, 6, { solution: '1.e2-e4 !\n1.d2-d4 !' })];
  assert.deepEqual(sprintCandidates(rows, '2026-10-12').map(p => p.id), ['21', '20', '19', '18']);
  assert.deepEqual(selectSprintPuzzles(rows, '2026-10-12', p => p.id !== '21').map(p => p.id), ['20', '19', '18']);
  assert.equal(countWrongKeyTries('1.Qa3?\n1.Qa3 ?\n1...a7-a6 !\n1.e2-e4 !'), 1);
});

test('the real validator rejects a non-mating key and malformed positions', () => {
  assert.equal(verifySprintPuzzle(parseEntry(entry('invalid', startPositions[0]))), false);
  assert.equal(verifySprintPuzzle({ fen: 'invalid', key: 'e2e4' }), false);
});
