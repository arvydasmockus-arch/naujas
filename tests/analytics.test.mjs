import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../server/gameStore.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { AnalyticsStore } from '../server/analyticsStore.mjs';

test('site analytics counts daily and monthly unique visitors without retaining raw IPs', () => {
  let now = Date.parse('2026-10-10T12:00:00Z');
  const game = new GameStore(':memory:', () => now);
  const db = game.db;
  new TournamentStore(db, () => now);
  const analytics = new AnalyticsStore(db, 'local-test-secret', () => now);
  analytics.record({ ip: '192.0.2.10', userAgent: 'test browser', section: 'news' });
  analytics.record({ ip: '192.0.2.10', userAgent: 'test browser', section: 'solving' });
  analytics.record({ ip: '192.0.2.10', userAgent: 'test browser', section: 'news' });
  analytics.record({ ip: '192.0.2.11', userAgent: 'test browser', section: 'news' });
  analytics.record({ ip: '192.0.2.10', userAgent: 'test browser', section: 'solving', action: 'answer' });

  const today = analytics.summary(30);
  assert.equal(today.totals.views, 4);
  assert.equal(today.totals.visitors, 2);
  assert.equal(today.sections.find((row) => row.section === 'news').views, 3);
  assert.equal(today.sections.find((row) => row.section === 'news').visitors, 2);
  assert.equal(today.sections.find((row) => row.section === 'solving').views, 1);
  assert.equal(today.monthly[0].visitors, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE visitor_id LIKE '%192.0.2.%'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 5);

  now = Date.parse('2026-11-01T12:00:00Z');
  analytics.record({ ip: '192.0.2.10', userAgent: 'test browser', section: 'news' });
  const nextMonth = analytics.summary(90);
  assert.equal(nextMonth.monthly.length, 2);
  assert.equal(nextMonth.monthly[0].visitors, 1);
  assert.equal(nextMonth.monthly[1].visitors, 2);
  game.close();
});
