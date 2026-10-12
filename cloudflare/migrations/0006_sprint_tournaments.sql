CREATE TABLE IF NOT EXISTS sprint_days (
  date TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sprint_puzzles (
  date TEXT NOT NULL REFERENCES sprint_days(date),
  ordinal INTEGER NOT NULL,
  puzzle_id TEXT NOT NULL,
  puzzle TEXT NOT NULL,
  position_hash TEXT NOT NULL UNIQUE,
  pieces INTEGER NOT NULL,
  alternative_moves INTEGER NOT NULL,
  PRIMARY KEY(date, ordinal)
);
CREATE TABLE IF NOT EXISTS sprint_sessions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL REFERENCES sprint_days(date),
  player_id TEXT NOT NULL REFERENCES players(id),
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER,
  answers TEXT,
  scores TEXT,
  points INTEGER,
  elapsed_seconds INTEGER,
  UNIQUE(date, player_id)
);
CREATE INDEX IF NOT EXISTS sprint_sessions_date ON sprint_sessions(date, submitted_at);
CREATE INDEX IF NOT EXISTS sprint_sessions_player ON sprint_sessions(player_id, submitted_at);
