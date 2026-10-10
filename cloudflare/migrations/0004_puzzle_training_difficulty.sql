CREATE TABLE IF NOT EXISTS puzzle_training_difficulty (
  puzzle_id TEXT PRIMARY KEY,
  hard INTEGER NOT NULL,
  pieces INTEGER NOT NULL,
  alternative_moves INTEGER NOT NULL
);
