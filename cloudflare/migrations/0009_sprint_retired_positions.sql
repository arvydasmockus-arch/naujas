CREATE TABLE IF NOT EXISTS sprint_retired_positions (
  position_hash TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL,
  retired_at INTEGER NOT NULL
);
