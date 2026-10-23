import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintToday } from '../src/sprintDate.js';

test('the initial sprint date is the login day in Lithuania, including midnight and daylight saving', () => {
  for (const [timestamp, expected] of [
    ['2026-10-20T20:59:59Z', '2026-10-20'],
    ['2026-10-20T21:00:00Z', '2026-10-21'],
    ['2026-12-20T21:59:59Z', '2026-12-20'],
    ['2026-12-20T22:00:00Z', '2026-12-21'],
    ['2026-03-29T21:00:00Z', '2026-03-30'],
    ['2026-10-25T22:00:00Z', '2026-10-26'],
  ]) assert.equal(sprintToday(Date.parse(timestamp)), expected);
});
