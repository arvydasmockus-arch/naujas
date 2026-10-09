CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  raw TEXT,
  puzzle TEXT,
  eligible INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  position_hash TEXT
);
CREATE INDEX IF NOT EXISTS puzzle_selection ON puzzles(eligible, verified);

CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS import_pages (page INTEGER PRIMARY KEY, count INTEGER NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS daily (date TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS daily_puzzles (
  date TEXT NOT NULL REFERENCES daily(date), ordinal INTEGER NOT NULL,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id), position_hash TEXT NOT NULL UNIQUE,
  PRIMARY KEY(date, ordinal)
);
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (
  player_id TEXT NOT NULL REFERENCES players(id), date TEXT NOT NULL REFERENCES daily(date), ordinal INTEGER NOT NULL,
  started_at INTEGER NOT NULL, answered_at INTEGER, seconds INTEGER, move TEXT, san TEXT, correct INTEGER,
  reopens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(player_id, date, ordinal)
);

CREATE TABLE IF NOT EXISTS tournament_pool (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, raw TEXT NOT NULL,
  puzzle TEXT NOT NULL, position_hash TEXT NOT NULL, checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tournament_pool_type ON tournament_pool(type);
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL,
  mode TEXT NOT NULL, status TEXT NOT NULL, solutions_public INTEGER NOT NULL DEFAULT 0,
  results_public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
  weekly INTEGER NOT NULL DEFAULT 0, number INTEGER UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_week ON tournaments(date) WHERE weekly = 1;
CREATE TABLE IF NOT EXISTS tournament_problems (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id), ordinal INTEGER NOT NULL,
  puzzle TEXT NOT NULL, position_hash TEXT NOT NULL UNIQUE,
  scoring_notes TEXT NOT NULL DEFAULT '', solution_draft TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(tournament_id, ordinal)
);
CREATE TABLE IF NOT EXISTS tournament_sessions (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id TEXT NOT NULL, name TEXT NOT NULL, started_at INTEGER NOT NULL,
  submitted_at INTEGER, answers TEXT, UNIQUE(tournament_id, player_id)
);
CREATE TABLE IF NOT EXISTS tournament_results (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name TEXT NOT NULL, country TEXT NOT NULL, category TEXT NOT NULL, rating TEXT NOT NULL,
  title TEXT NOT NULL, scores TEXT NOT NULL, minutes REAL NOT NULL, notes TEXT NOT NULL DEFAULT ''
);
