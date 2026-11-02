import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMateInTwo } from '../src/lib/mateInTwo.js';

const normalized = (lines) => lines.map((line) => line.trim()).sort();

test('the supplied #2 position matches all Olive Key, Try and Set lines without the false Ne2-c1 mate', () => {
  const answer = solveMateInTwo('5b1N/nr1p1B1q/pPR2pp1/Rnp1k1p1/KP2p1P1/4Q3/4Nr2/6B1 w - - 0 1');

  assert.deepEqual(normalized(answer.play), normalized([
    '1.Qe3-b3 ! threat:', '2.Qb3-d5 #',
    '1...Rf2*e2', '2.Qb3-g3 #',
    '1...Sb5-c3 +', '2.Qb3*c3 #',
    '1...Sb5-c7', '2.Qb3-b2 #', '2.Qb3-c3 #',
    '1...c5-c4', '2.Qb3-c3 #',
    '1...d7*c6', '2.Qb3-e6 #',
    '1...Qh7*f7', '2.Sh8*f7 #',
  ]));
  assert.deepEqual(normalized(answer.tries), normalized([
    '1.Bg1-h2 + ?', '1...Rf2*h2', '2.Qe3-g3 #', '1...Qh7*h2', '2.Sh8*g6 #', 'but', '1...Rf2-f4 !',
    '1.Qe3*c5 + ?', '1...d7-d5', '2.Rc6-e6 #', '2.Qc5*d5 #', 'but', '1...Bf8*c5 !',
    '1.Qe3-c3 + ?', '1...Sb5-d4', '2.Qc3*d4 #', 'but', '1...Sb5*c3 + !',
    '1.Qe3*e4 + ?', 'but', '1...Ke5*e4 !',
    '1.Qe3-g3 + ?', 'but', '1...Rf2-f4 !',
    '1.Rc6-e6 + ?', '1...Ke5-d5', '2.Qe3*e4 #', 'but', '1...d7*e6 !',
    '1.Sh8*g6 + ?', 'but', '1...Qh7*g6 !',
  ]));
  assert.deepEqual(normalized(answer.setPlay), normalized([
    '1...Rf2*e2', '2.Qe3-g3 #',
    '1...Rf2-h2', '2.Qe3-g3 #',
    '1...Sb5-a3', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...Sb5-c3 +', '2.Qe3*c3 #',
    '1...Sb5-c7', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...Sb5-d4', '2.Qe3*d4 #',
    '1...Sb5-d6', '2.Rc6*c5 #', '2.Ra5*c5 #', '2.Qe3*c5 #', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...c5*b4', '2.Qe3-d4 #',
    '1...c5-c4', '2.Qe3-d4 #', '2.Qe3-c3 #',
    '1...d7-d5', '2.Rc6-e6 #',
    '1...Qh7-h1', '2.Sh8*g6 #',
    '1...Qh7-h2', '2.Sh8*g6 #',
    '1...Qh7-h3', '2.Sh8*g6 #',
    '1...Qh7-h4', '2.Sh8*g6 #',
  ]));
  assert.ok(![...answer.play, ...answer.setPlay, ...answer.tries].some((line) => line.includes('Ne2-c1')));
});
