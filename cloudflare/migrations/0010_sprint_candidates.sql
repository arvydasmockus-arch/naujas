CREATE TABLE IF NOT EXISTS sprint_candidates (
  id TEXT PRIMARY KEY,
  puzzle TEXT NOT NULL,
  position_hash TEXT NOT NULL UNIQUE,
  pieces INTEGER NOT NULL,
  wrong_key_tries INTEGER NOT NULL,
  publication_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sprint_candidates_priority ON sprint_candidates (
  min(pieces,20) DESC, (wrong_key_tries>=5) DESC, wrong_key_tries DESC, pieces DESC, id
);
