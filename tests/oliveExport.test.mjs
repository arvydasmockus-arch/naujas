import test from 'node:test';
import assert from 'node:assert/strict';
import { exportOliveCollection } from '../src/lib/oliveExport.js';

test('Olive export creates a numbered multi-problem YAML collection using Olive algebraic piece letters', () => {
  const text = exportOliveCollection([
    { number: 2, fen: '8/8/8/8/8/8/4k3/4K3 b - - 0 1', stipulation: 'h#2' },
    { number: 1, fen: 'r3k2r/ppp2ppp/2n5/3pp3/3PP3/2N5/PPP2PPP/R3K2R w KQkq - 0 1', stipulation: '#2' },
  ]);
  assert.match(text, /^---\nalgebraic:\n  black: \[Ra8, Ke8, Rh8, Pa7, Pb7, Pc7, Pf7, Pg7, Ph7, Sc6, Pd5, Pe5\]/);
  assert.match(text, /  white: \[Pd4, Pe4, Sc3, Pa2, Pb2, Pc2, Pf2, Pg2, Ph2, Ra1, Ke1, Rh1\]/);
  assert.match(text, /stipulation: '#2'/);
  assert.match(text, /solution: ''/);
  assert.match(text, /---\nalgebraic:/g);
  assert.match(text, /ML Academy #2; black to move; FEN:/);
});

test('empty Olive archive downloads as an empty collection', () => {
  assert.equal(exportOliveCollection([]), '');
});
