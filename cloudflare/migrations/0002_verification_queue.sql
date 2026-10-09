CREATE TABLE IF NOT EXISTS puzzle_verification_queue (
  puzzle_id TEXT PRIMARY KEY,
  enqueued_at INTEGER NOT NULL
);
