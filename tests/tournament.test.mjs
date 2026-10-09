import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { publicationDate, oldEnough, parseTournamentEntry, helpmateSolutionCount, latestSaturday, knownSolvingUse } from '../server/tournamentTools.mjs';
import { tournamentPdf } from '../server/tournamentPdf.mjs';
const entries = JSON.parse(readFileSync(new URL('./fixtures/tournamentEntries.json', import.meta.url), 'utf8'));
function setup() {
  let now = Date.parse('2026-10-10T07:05:00Z');
  const db = openDatabase(':memory:', false);
  const store = new TournamentStore(db, () => now);
  const insert = db.prepare('INSERT INTO tournament_pool VALUES(?,?,?,?,?,?)');
  for (const entry of entries) {
    const puzzle = parseTournamentEntry(entry, '2026-10-09T00:00:00Z');
    assert.ok(puzzle, `Fixture ${entry.id} rejected`);
    insert.run(puzzle.id, puzzle.type, JSON.stringify(entry), JSON.stringify(puzzle), puzzle.positionHash, puzzle.usageCheckedAt);
  }
  return { store, db, advance: (milliseconds) => { now += milliseconds; } };
}
test('publication age uses exact dates and treats missing month/day conservatively', () => {
  assert.equal(publicationDate({ source: { date: { year: 2021 } } }), '2021-12-31');
  assert.equal(publicationDate({ source: { date: { year: 2021, month: 10 } } }), '2021-10-31');
  assert.equal(oldEnough('2021-10-10', '2026-10-10'), true);
  assert.equal(oldEnough('2021-10-11', '2026-10-10'), false);
  assert.equal(oldEnough(null, '2026-10-10'), false);
  assert.equal(parseTournamentEntry({ ...entries[0], source: { date: { year: 2024 } } }), null);
});
test('solving use is rejected, composing awards are retained, helpmate count cannot exceed six', () => {
  assert.equal(knownSolvingUse({ award: { tourney: { name: 'Composition award' } } }), false);
  assert.equal(knownSolvingUse({ reprints: [{ type: 'solving event', name: 'Event' }] }), true);
  assert.equal(knownSolvingUse({ reprints: [{ name: 'WCSC 2019', round: 2 }] }), true);
  assert.equal(parseTournamentEntry({ ...entries[0], reprints: [{ name: 'European Solving Championship' }] }), null);
  assert.equal(helpmateSolutionCount({ solution: '1...A 2.B#\n1...C 2.D#', 'intended-solutions': '2' }), 2);
  assert.equal(helpmateSolutionCount({ solution: '1...A 2.B#', 'intended-solutions': '7' }), null);
  const help = entries.find((entry) => /^h#/.test(entry.stipulation));
  assert.equal(parseTournamentEntry({ ...help, stipulation: 'h#8' }), null);
  assert.equal(parseTournamentEntry({ ...help, stipulation: 's#6' }), null);
});
test('missing, None and non-move study solutions plus Dual/Cooked labels are rejected', () => {
  const study = entries.find((entry) => ['+', '='].includes(entry.stipulation));
  for (const solution of [undefined, '', 'None', 'null', 'Solution unknown']) {
    assert.equal(parseTournamentEntry({ ...study, solution }), null);
  }
  const regular = entries[0];
  assert.equal(parseTournamentEntry({ ...regular, keywords: ['Dual'] }), null);
  assert.equal(parseTournamentEntry({ ...regular, keywords: ['Cooked'] }), null);
  assert.equal(parseTournamentEntry({ ...regular, comments: ['This composition has duals.'] }), null);
  assert.equal(parseTournamentEntry({ ...regular, solution: `${regular.solution}\n{cooked}` }), null);
  assert.ok(parseTournamentEntry({ ...regular, keywords: ['Dual avoidance'] }));
});
test('six types, dense direct/selfmates, sparse studies/helpmates, and no reused positions', () => {
  const { store, db } = setup();
  try {
    const first = store.generate({ mode: 'training' });
    const second = store.generate({ mode: 'training' });
    assert.deepEqual(first.puzzles.map((puzzle) => puzzle.type), ['#2', '#3', '#n', 'study', 's#n', 'h#n']);
    assert.equal(new Set([...first.puzzles, ...second.puzzles].map((puzzle) => puzzle.positionHash)).size, 12);
    for (const puzzle of first.puzzles.filter((puzzle) => ['#2', '#3', '#n', 's#n'].includes(puzzle.type))) {
      assert.ok(puzzle.whiteCount + puzzle.blackCount > 15);
    }
    assert.ok(first.puzzles.find((puzzle) => puzzle.type === 'study').whiteCount + first.puzzles.find((puzzle) => puzzle.type === 'study').blackCount < 16);
    assert.ok(first.puzzles.find((puzzle) => puzzle.type === 'h#n').solutions <= 6);
  } finally { db.close(); }
});
test('competition drafts, source solutions and judge notes stay private until explicitly published', () => {
  const { store, db } = setup();
  try {
    const event = store.generate({ mode: 'competition' });
    assert.equal(store.list().tournaments.length, 0);
    assert.throws(() => store.get(event.id), /not found/);
    assert.throws(() => store.settings(event.id, { status: 'published' }), /Review/);
    store.settings(event.id, { status: 'published', judgeReviewed: true, scoringNotes: Array(6).fill('Judge notes') });
    const publicEvent = store.get(event.id);
    assert.equal(publicEvent.puzzles[0].solution, undefined);
    assert.equal(publicEvent.puzzles[0].scoringNotes, undefined);
    assert.equal(publicEvent.puzzles[0].id, undefined);
    assert.throws(() => store.replaceProblem(event.id, 0), /unpublished/);
    store.settings(event.id, { solutionsPublic: true });
    assert.ok(store.get(event.id).puzzles[0].solution);
  } finally { db.close(); }
});
test('manual fractional points are ranked by points and time; invalid points are rejected', () => {
  const { store, db } = setup();
  try {
    const event = store.generate();
    for (const [name, minutes] of [['Alice', 115], ['Bob', 100], ['Carol', 100]]) {
      store.saveResult(event.id, { name, minutes, scores: [5, 2.5, 0, 1.25, 5, 0], notes: 'Private judge note' });
    }
    const rows = store.get(event.id, true).results;
    assert.equal(rows[0].name, 'Bob'); assert.equal(rows[0].total, 13.75);
    assert.deepEqual(rows.map((row) => row.rank), [1, 1, 3]);
    assert.equal(store.get(event.id).results.length, 0);
    assert.throws(() => store.saveResult(event.id, { name: 'Invalid', minutes: 121, scores: Array(6).fill(5) }), /Time/);
    assert.throws(() => store.saveResult(event.id, { name: 'Invalid', minutes: 10, scores: Array(6).fill(6) }), /score/);
    store.settings(event.id, { resultsPublic: true }); assert.equal(store.get(event.id).results.length, 3);
    assert.equal(store.get(event.id).results[0].notes, undefined);
  } finally { db.close(); }
});
test('two-hour deadline survives reload, six written solutions are saved once, late submissions close', () => {
  const { store, db, advance } = setup();
  try {
    const event = store.generate();
    const session = store.start(event.id, 'Tester');
    advance(60000);
    assert.equal(store.start(event.id, 'tester').startedAt, session.startedAt);
    store.submit(event.id, session.id, Array(6).fill('A full written solution'));
    assert.throws(() => store.submit(event.id, session.id, Array(6).fill('changed')), /already/);
    assert.equal(store.get(event.id, true).submissions.length, 1);
    assert.equal(store.get(event.id).submissions, undefined);
    const late = store.start(event.id, 'Late player'); advance(7200001);
    assert.throws(() => store.submit(event.id, late.id, Array(6).fill('')), /ended/);
  } finally { db.close(); }
});
test('weekly rotation follows Saturday 10:00 in Lithuania, including daylight saving', () => {
  assert.equal(latestSaturday(Date.parse('2026-10-10T06:59:00Z')), '2026-10-03');
  assert.equal(latestSaturday(Date.parse('2026-10-10T07:00:00Z')), '2026-10-10');
  assert.equal(latestSaturday(Date.parse('2026-11-07T07:59:00Z')), '2026-10-31');
  assert.equal(latestSaturday(Date.parse('2026-11-07T08:00:00Z')), '2026-11-07');
  const { store, db } = setup();
  try { store.ensureWeekly(); store.ensureWeekly(); assert.equal(store.list().tournaments.length, 1); } finally { db.close(); }
});
test('tournament numbers and dated names persist across store reopening', () => {
  const { store, db } = setup();
  try {
    const first = store.generate({ date: '2026-10-03' });
    assert.equal(first.number, 1);
    assert.equal(first.displayTitle, 'Solving tournament of Martynas Limontas No. 1 — 2026.10.03');
    const reopened = new TournamentStore(db, () => Date.parse('2026-10-10T07:05:00Z'));
    const second = reopened.generate({ date: '2026-10-10' });
    assert.equal(second.number, 2);
    assert.equal(reopened.get(first.id).number, 1);
  } finally { db.close(); }
});

test('a newer training set also prevents older weekly recreation when hidden by the judge', () => {
  const { store, db } = setup();
  try {
    const event = store.generate({ date: '2026-10-11', mode: 'training' });
    store.settings(event.id, { status: 'draft' });
    store.ensureWeekly();
    assert.equal(store.list(true).tournaments.length, 1);
  } finally { db.close(); }
});
test('edited solution drafts persist, remain private and reject invalid points atomically', () => {
  const { store, db } = setup();
  try {
    const event = store.generate();
    const drafts = event.puzzles.map((puzzle) => puzzle.solutionDraft);
    drafts[0] = '1.Qf1! [5]\nJudge correction';
    store.settings(event.id, { solutionDrafts: drafts });
    assert.equal(store.get(event.id, true).puzzles[0].solutionDraft, drafts[0]);
    assert.equal(store.get(event.id).puzzles[0].solutionDraft, undefined);
    assert.throws(() => store.settings(event.id, { solutionDrafts: drafts.map(() => '1.Qf1 [6]') }));
    assert.equal(store.get(event.id, true).puzzles[0].solutionDraft, drafts[0]);
    store.settings(event.id, { solutionsPublic: true });
    assert.equal(store.get(event.id).puzzles[0].solutionDraft, drafts[0]);
  } finally { db.close(); }
});

test('problem, solution and result exports are real PDFs', async () => {
  const { store, db } = setup();
  try {
    const event = store.generate();
    for (const kind of ['problems', 'solutions', 'results']) {
      const pdf = await tournamentPdf(event, kind);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 10000);
    }
  } finally { db.close(); }
});
