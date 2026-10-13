import test from 'node:test';
import assert from 'node:assert/strict';
import { shortSolution, compactSolution } from '../server/solutionNotation.mjs';
import { sprintStatistics, sprintLeaderboard, sprintPlayerHistory } from '../server/sprintReview.mjs';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('daily statistics count success out of three and rank points before actual elapsed time', () => {
  const make = (name, answers, scores, seconds) => ({ playerId: name, name,
    answers: JSON.stringify(answers), scores: JSON.stringify(scores), elapsedSeconds: seconds });
  const rows = sprintLeaderboard([
    make('Alice', ['e4', '', ''], [1, 0, 0], 100),
    make('Bob', ['e4', 'Nf3', ''], [1, 0, 0], 80),
    make('Carol', ['e4', 'e4', 'Nf3'], [1, 1, 0], 400),
    make('David', ['e4', 'Nf3', 'Nf3'], [1, 0, 0], 80),
    make('Eve', ['', '', ''], [0, 0, 0], 5),
  ], true);
  assert.deepEqual(rows.map(row => row.name), ['Carol', 'Bob', 'David', 'Alice', 'Eve']);
  assert.equal(rows[0].success, 66.67);
  assert.equal(rows.find(row => row.name === 'Alice').success, 33.33);
  assert.equal(rows.find(row => row.name === 'Bob').success, 33.33);
  assert.equal(rows.find(row => row.name === 'Eve').success, 0);
});

test('a 4:51 sprint stays 4:51 even when its cumulative answer timestamps add up to 10:45', () => {
  const session = { playerId: 'pavlov', name: 'Pavlov Danila', date: '2026-10-13',
    elapsedSeconds: 291, problemSeconds: '[131,228,286]', answers: '["Bh3","Rg4","Bh8"]', scores: '[1,1,1]' };
  const row = sprintLeaderboard([session])[0];
  assert.equal(row.totalSeconds, 291);
  assert.equal(row.averageSeconds, 97);
  assert.equal(row.correct, 3);
  assert.equal(row.success, 100);
  const day = sprintPlayerHistory([session]).days[0];
  assert.equal(day.totalSeconds, 291);
  assert.deepEqual(day.results.map(result => result.seconds), [131, 228, 286]);
  const second = { ...session, date: '2026-10-12', elapsedSeconds: 100, problemSeconds: '[10,40,95]' };
  assert.equal(sprintLeaderboard([session, second])[0].totalSeconds, 391);
});

test('compact reviews show only the key and tries with their marked refutations', () => {
  const solution = '1...a7-a6\n2.e2-e4\n1.e2-e4! threat: 2.d2-d4\n1...a7-a6\n2.d2-d4\n'
    + '1.d2-d4?\n1...a7-a6\n2.e2-e4\n but\n1...e7-e5!\n1.c2-c4?\n1...d7-d5!';
  assert.equal(compactSolution({ fen, key: 'e2e4', solution }), '1.e4!\n1.d4? e5!\n1.c4? d5!');
  assert.equal(compactSolution({ fen, key: 'e2e4', solution: '1.d2-d4 + ?\n1...e7-e5 + !' }), '1.e4!\n1.d4? e5!');
});

test('full source solutions retain tries, refutations, threats and comments while shortening every branch', () => {
  const solution = '1.e2-e4 ! threat: 2.d2-d4\n 1...a7-a6\n 2.d2-d4\n 1...b7-b6\n 2.d2-d4\n1.d2-d4 ?\n 1...e7-e5 !\n{1.Qa1-a8 is a source comment}';
  assert.equal(shortSolution({ fen, solution }), '1.e4 ! threat: 2.d4\n 1...a6\n 2.d4\n 1...b6\n 2.d4\n1.d4 ?\n 1...e5 !\n{1.Qa1-a8 is a source comment}');
});

test('short notation distinguishes same-colour pieces using only the necessary file or rank', () => {
  assert.equal(shortSolution({ fen: '7k/8/8/8/8/8/8/1N1NK3 w - - 0 1', solution: '1.Sb1-c3!' }), '1.Nbc3!');
  assert.equal(shortSolution({ fen: '7k/8/8/8/8/R7/8/R3K3 w - - 0 1', solution: '1.Ra1-a2!' }), '1.R1a2!');
  assert.equal(shortSolution({ fen: 'k7/8/8/8/8/8/8/1B2KB2 w - - 0 1', solution: '1.Bf1-d3!' }), '1.Bfd3!');
});

test('multiple threat continuations retain their common branch position', () => {
  assert.equal(shortSolution({ fen, solution: '1.e2-e4! threat:\n2.d2-d4\n2.f2-f4\n1...a7-a6\n2.d2-d4' }),
    '1.e4! threat:\n2.d4\n2.f4\n1...a6\n2.d4');
});

test('illegal source moves are retained instead of guessed and check markers are not duplicated', () => {
  assert.equal(shortSolution({ fen, solution: '1.Qd1-h5!\n1.e2-e4! 1...a7-a6 2.Bf1-b5 +' }), '1.Qd1-h5!\n1.e4! 1...a6 2.Bb5 +');
});

test('submitted moves are grouped by SAN with player names, times and separate skipped answers', () => {
  const row = (name, answer, correct, seconds) => ({ name, answers: JSON.stringify([answer, '', '']),
    scores: JSON.stringify([correct, 0, 0]), problemSeconds: JSON.stringify([seconds, seconds, seconds]), elapsedSeconds: seconds });
  const rows = [row('Alice', 'e4', 1, 20), row('Bob', 'e2e4', 1, 40), row('Carol', 'Nf3', 0, 30), row('David', '', 0, 60)];
  const [stat] = sprintStatistics(rows, [{ fen }], true);
  assert.equal(stat.solved, 2); assert.equal(stat.skipped, 1);
  assert.equal(stat.averageSeconds, 37.5);
  assert.equal(stat.moves[0].move, 'e4'); assert.equal(stat.moves[0].count, 2);
  assert.equal(stat.moves[0].averageSeconds, 30);
  assert.deepEqual(stat.moves[0].players, [{ name: 'Alice', seconds: 20 }, { name: 'Bob', seconds: 40 }]);
  assert.equal(stat.moves[1].move, 'Nf3'); assert.equal(stat.moves[2].move, '');
  assert.equal(Object.hasOwn(sprintStatistics(rows, [{ fen }])[0], 'moves'), false);
});
