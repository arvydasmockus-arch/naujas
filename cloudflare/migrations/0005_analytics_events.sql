CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  section TEXT NOT NULL,
  action TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS analytics_events_day ON analytics_events(day, section);
CREATE INDEX IF NOT EXISTS analytics_events_month ON analytics_events(month, visitor_id);
