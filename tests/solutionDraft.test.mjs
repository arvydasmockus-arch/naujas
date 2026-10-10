import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solutionDraft, studyMoveCount } from '../server/solutionDraft.mjs';
import { parseTournamentEntry } from '../server/tournamentTools.mjs';
const entries = JSON.parse(readFileSync(new URL('./fixtures/tournamentEntries.json', import.meta.url), 'utf8'));
const puzzles = entries.map((entry) => parseTournamentEntry(entry));

test('two-mover draft contains just the shortened key and five points', () => {
  const puzzle = puzzles.find((item) => item.type === '#2');
  const draft = solutionDraft(puzzle);
  assert.match(draft.text, /1\.[^\n]+ \[5\]/);
  assert.doesNotMatch(draft.text, /2\.|1\.\.\./);
});

test('three-mover scoring appears on second white moves without separate key points', () => {
  const puzzle = puzzles.find((item) => item.type === '#3');
  const draft = solutionDraft(puzzle);
  assert.doesNotMatch(draft.text, /1\.[^\s]+ \[/);
  assert.match(draft.text, /2\.[^\s]+ \[\d+(?:\.\d+)?\]/);
  const scores = [...draft.text.matchAll(/\[(\d+(?:\.\d+)?)\]/g)].map((match) => Number(match[1]));
  assert.ok(Math.abs(scores.reduce((sum, score) => sum + score, 0) - 5) < .001);
  assert.doesNotMatch(draft.text, /3\.[^\s]+ \[/);
});

test('two helpmate solutions each receive 2.5 rather than cumulative points', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
  const line = '1.e7-e5 e2-e4 2.Sg8-f6 Sb1-c3 3.Bf8-b4 Sg1-f3';
  const draft = solutionDraft({ fen, type: 'h#n', stipulation: 'h#3', solution: `${line}\n${line}` });
  assert.deepEqual(draft.text.match(/\[\d+(?:\.\d+)?\]/g), ['[2.5]', '[2.5]']);
});

test('helpmate and selfmate points follow final white moves only', () => {
  for (const type of ['h#n', 's#n']) {
    const puzzle = puzzles.find((item) => item.type === type);
    const moves = Number(puzzle.stipulation.replace(/\D/g, ''));
    const draft = solutionDraft(puzzle);
    const scores = [...draft.text.matchAll(/\[(\d+(?:\.\d+)?)\]/g)].map((match) => Number(match[1]));
    assert.ok(Math.abs(scores.reduce((sum, score) => sum + score, 0) - 5) < .001);
    assert.ok(Math.max(...scores) - Math.min(...scores) <= .010001);
    for (const line of draft.text.split('\n')) {
      assert.equal((line.match(/\[\d+(?:\.\d+)?\]/g) ?? []).length, 1);
      if (type === 's#n') assert.match(line, new RegExp(`${moves}\\.[^\\s]+ \\[`));
      else assert.match(line, new RegExp(`${moves}\\.[^\\s]+ [^\\s]+ \\[`));
    }
  }
});

test('studies receive just a first-move suggestion and reject solutions over ten moves', () => {
  const entry = entries.find((item) => ['+', '='].includes(item.stipulation));
  const draft = solutionDraft(parseTournamentEntry(entry));
  assert.equal((draft.text.match(/\[1\]/g) ?? []).length, 1);
  assert.doesNotMatch(draft.text, /\[5\]/);
  assert.equal(studyMoveCount('1.Ka1-b1 {99.Ka1-b1} 10.Kb1-c1'), 10);
  assert.equal(parseTournamentEntry({ ...entry, solution: `${entry.solution}\n11.Ka1-b1` }), null);
});

test('SAN keeps only the file or rank needed to distinguish legal pieces', () => {
  assert.equal(solutionDraft({ type: '#2', stipulation: '#2', fen: '7k/8/8/8/8/8/8/1N1NK3 w - - 0 1', solution: '1.Sb1-c3!' }).text, '1.Nbc3! [5]');
  assert.equal(solutionDraft({ type: '#2', stipulation: '#2', fen: '7k/8/8/8/8/R7/8/R3K3 w - - 0 1', solution: '1.Ra1-a2!' }).text, '1.R1a2! [5]');
});

test('four lines each get 1.25 points and tries retain refutations', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const solution = '1.e2-e4! 1...a7-a6 2.d2-d4 1...b7-b6 2.d2-d4 1...c7-c6 2.d2-d4 1...d7-d6 2.d2-d4';
  assert.deepEqual(solutionDraft({ fen, type: '#3', stipulation: '#3', solution }).text.match(/\[\d+(?:\.\d+)?\]/g), Array(4).fill('[1.25]'));
  const draft = solutionDraft({ fen, type: '#2', stipulation: '#2', solution: '1.e2-e4! 1...a7-a6 2.d2-d4 1.d2-d4? 1...e7-e5!' });
  assert.equal(draft.text, '1.e4! [5]\n1.d4? e5!');
  const withThreat = solutionDraft({ fen, type: '#3', stipulation: '#3',
    solution: '1.e2-e4! threat: 2.d2-d4 1...a7-a6 2.d2-d4 1...b7-b6 2.d2-d4 1...c7-c6 2.d2-d4 1...d7-d6 2.d2-d4' });
  assert.match(withThreat.text, /1\.e4! ~ 2\.d4 \[1\]/);
  assert.match(withThreat.text, /1\.\.\.a6 2\.d4 \[1\]/);
  assert.doesNotMatch(withThreat.text, /1\.\.\.a6 2\.d4 1\.\.\./);
});
