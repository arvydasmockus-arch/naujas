import { createHmac, randomUUID } from 'node:crypto';

const sections = new Set(['news', 'solving', 'training', 'tournaments']);
const actions = new Set(['page_view', 'start', 'answer', 'submit']);

export class AnalyticsStore {
  constructor(db, secret, clock = () => Date.now()) {
    this.db = db; this.secret = secret; this.clock = clock; this.lastCleanupDay = '';
    db.exec(`CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, day TEXT NOT NULL, month TEXT NOT NULL,
      visitor_id TEXT NOT NULL, section TEXT NOT NULL, action TEXT NOT NULL, mode TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS analytics_events_day ON analytics_events(day, section);
    CREATE INDEX IF NOT EXISTS analytics_events_month ON analytics_events(month, visitor_id);`);
  }

  record({ ip, userAgent = '', section, action = 'page_view', mode = '' }) {
    if (!sections.has(section) || !actions.has(action)) throw new Error('Invalid analytics event.');
    const timestamp = this.clock();
    const date = new Date(timestamp).toISOString();
    const day = date.slice(0, 10); const month = date.slice(0, 7);
    if (day !== this.lastCleanupDay) {
      const cutoff = new Date(timestamp - 90 * 86400000).toISOString().slice(0, 10);
      this.db.prepare('DELETE FROM analytics_events WHERE day<?').run(cutoff);
      this.lastCleanupDay = day;
    }
    const visitorId = createHmac('sha256', this.secret).update(`${month}:${ip || 'unknown'}:${userAgent.slice(0, 300)}`).digest('hex');
    this.db.prepare('INSERT INTO analytics_events(id,occurred_at,day,month,visitor_id,section,action,mode) VALUES(?,?,?,?,?,?,?,?)')
      .run(randomUUID(), timestamp, day, month, visitorId, section, action, mode);
  }

  summary(days = 90) {
    const range = Math.max(7, Math.min(90, Number(days) || 90));
    const since = new Date(this.clock() - (range - 1) * 86400000).toISOString().slice(0, 10);
    const pages = this.db.prepare(`SELECT day,section,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_events WHERE day>=? AND action='page_view' GROUP BY day,section ORDER BY day DESC,section`).all(since);
    const monthly = this.db.prepare(`SELECT month,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors,
      COUNT(DISTINCT day) AS activeDays FROM analytics_events WHERE day>=? AND action='page_view' GROUP BY month ORDER BY month DESC`).all(since);
    const monthlyDaily = this.db.prepare(`SELECT month,AVG(visitors) AS averageDailyVisitors FROM (
      SELECT month,day,COUNT(DISTINCT visitor_id) AS visitors FROM analytics_events WHERE day>=? AND action='page_view' GROUP BY month,day
    ) GROUP BY month`).all(since);
    const daily = this.db.prepare(`SELECT day,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_events WHERE day>=? AND action='page_view' GROUP BY day ORDER BY day DESC`).all(since);
    const dailySolving = this.db.prepare(`SELECT date AS day,COUNT(DISTINCT player_id) AS players,
      SUM(CASE WHEN answered_at IS NOT NULL THEN 1 ELSE 0 END) AS answers,
      SUM(CASE WHEN answered_at IS NOT NULL AND correct=0 THEN 1 ELSE 0 END) AS incorrect,
      ROUND(AVG(CASE WHEN answered_at IS NOT NULL THEN seconds END),1) AS averageSeconds
      FROM attempts WHERE date>=? GROUP BY date ORDER BY date DESC`).all(since);
    const dailyTournaments = this.db.prepare(`SELECT date(s.started_at/1000,'unixepoch') AS day,t.mode AS mode,
      COUNT(DISTINCT s.player_id) AS players,COUNT(s.submitted_at) AS submissions
      FROM tournament_sessions s JOIN tournaments t ON t.id=s.tournament_id
      WHERE s.started_at>=? GROUP BY day,t.mode ORDER BY day DESC,t.mode`).all(Date.parse(`${since}T00:00:00Z`));
    const totals = this.db.prepare(`SELECT COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_events WHERE day>=? AND action='page_view'`).get(since);
    const sectionsByName = this.db.prepare(`SELECT section,COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_events WHERE day>=? AND action='page_view' GROUP BY section ORDER BY views DESC`).all(since);
    return { days: range, since, totals, monthly, monthlyDaily, daily, sections: sectionsByName, pageDays: pages, dailySolving, dailyTournaments,
      privacy: 'Monthly rotating HMAC identifiers are derived from IP and browser information. Raw IP addresses are not stored by the app.' };
  }
}
