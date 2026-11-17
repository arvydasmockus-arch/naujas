import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPositionText } from '../src/lib/positionTextImport.js';

test('extracts a FEN placement copied with a YACPDB label', () => {
  assert.equal(extractPositionText('YACPDB #228989\nFEN: 4k3/8/8/8/8/8/8/4K3'), '4k3/8/8/8/8/8/8/4K3');
});

test('preserves full FEN metadata from copied text', () => {
  assert.equal(extractPositionText('Position: r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 3 7'), 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 3 7');
});

test('does not mistake a YACPDB numeric identifier for a position', () => {
  assert.equal(extractPositionText('228989'), '');
});
