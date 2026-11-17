import test from 'node:test';
import assert from 'node:assert/strict';
import { gridRecoversRead } from '../src/lib/ocrBoardArbitration.js';

const source = { width: 500, height: 500 };
const full = { x0: 40, y0: 40, x1: 460, y1: 460 };

test('a full grid read can recover a partial primary board read', () => {
  assert.equal(gridRecoversRead(
    { plausible: true, meanConfidence: 0.9, minConfidence: 0.8, corners: { ...full, x1: 300 } },
    { plausible: true, meanConfidence: 0.83, minConfidence: 0.72, corners: full },
    source,
  ), true);
});

test('a different full-grid placement cannot override a more confident full primary read', () => {
  assert.equal(gridRecoversRead(
    { plausible: true, placement: '4k3/8/8/8/8/8/8/4K3', meanConfidence: 0.91, minConfidence: 0.82, corners: full },
    { plausible: true, placement: '4k3/8/8/8/8/8/3Q4/4K3', meanConfidence: 0.83, minConfidence: 0.72, corners: full },
    source,
  ), false);
});

test('the higher-confidence full-grid read wins when both are complete', () => {
  assert.equal(gridRecoversRead(
    { plausible: true, placement: '4k3/8/8/8/8/8/8/4K3', meanConfidence: 0.81, minConfidence: 0.70, corners: full },
    { plausible: true, placement: '4k3/8/8/8/8/8/3Q4/4K3', meanConfidence: 0.84, minConfidence: 0.72, corners: full },
    source,
  ), true);
});
