import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { hasPuzzleDefect, trainingDifficulty, verifyPuzzle } from '../server/puzzleTools.mjs';

test('solving accepts nine-piece positions and excludes eight-piece positions', () => {
  assert.equal(trainingDifficulty({ fen: 'k7/8/2K5/8/2Q5/8/PPPPP3/7R w - - 0 1' }).hard, true);
  assert.equal(trainingDifficulty({ fen: 'k7/8/2K5/8/2Q5/8/PPPP4/7R w - - 0 1' }).hard, false);
});

test('defect screening covers source comments, reprints, variants and multiple solutions', () => {
  for (const entry of [
    { comments: ['cooked'] }, { keywords: ['Dual'] }, { solution: '{unsound}' },
    { reprints: [{ comments: ['incorrect'] }] }, { twins: { b: 'move pawn' } },
    { solution: 'a) 1.Qa3!\nb) 1.Qa4!' }, { 'intended-solutions': 2 },
  ]) assert.equal(hasPuzzleDefect(entry), true);
  assert.equal(hasPuzzleDefect({ keywords: ['Dual avoidance'], solution: '1.Qa3?\n1...Rb5!\n1.Qa4!' }), false);
});

test('a mating key with two mating continuations is rejected as a dual', () => {
  const puzzle = { fen: 'k7/8/2K5/8/2Q5/8/8/7R w - - 0 1', key: 'c6c7' };
  const chess = new Chess(puzzle.fen);
  chess.move(puzzle.key);
  const replies = chess.moves({ verbose: true });
  assert.equal(replies.length, 1);
  chess.move(replies[0]);
  let mates = 0;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    mates += Number(chess.isCheckmate());
    chess.undo();
  }
  assert.ok(mates > 1);
  assert.equal(verifyPuzzle(puzzle), false);
});
