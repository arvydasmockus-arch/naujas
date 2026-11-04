CREATE TABLE IF NOT EXISTS saved_positions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  position_number INTEGER NOT NULL,
  fen TEXT NOT NULL,
  stipulation TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, position_number)
);
CREATE INDEX IF NOT EXISTS saved_positions_account_number ON saved_positions(account_id, position_number);
