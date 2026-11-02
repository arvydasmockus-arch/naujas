import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMateInTwo } from '../src/lib/mateInTwo.js';

test('the supplied #2 position matches Olive Set, Play and Try answers and omits the false Ne2-c1 mate', () => {
  const answer = solveMateInTwo('5b1N/nr1p1B1q/pPR2pp1/Rnp1k1p1/KP2p1P1/4Q3/4Nr2/6B1 w - - 0 1');

  assert.ok(answer.play.includes('   1.Qe3-b3 ! threat:'));
  assert.ok(answer.play.includes('          2.Qb3-d5 #'));
  assert.ok(answer.play.includes('      1...Rf2*e2'));
  assert.ok(answer.play.includes('          2.Qb3-g3 #'));
  assert.ok(answer.play.includes('          2.Sh8*f7 #'));
  assert.ok(answer.setPlay.includes('      1...Sb5-d6'));
  assert.ok(answer.setPlay.includes('          2.Rc6*c5 #'));
  assert.ok(answer.tries.includes('   1.Bg1-h2 + ?'));
  assert.ok(answer.tries.includes('      1...Rf2-f4 !'));
  assert.ok(![...answer.play, ...answer.setPlay, ...answer.tries].some((line) => line.includes('Ne2-c1')));
});
