CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  last_login_at INTEGER,
  last_seen_at INTEGER,
  code_hash TEXT,
  code_expires_at INTEGER,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  code_sent_at INTEGER,
  challenge_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_challenge ON accounts(challenge_id);
CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash TEXT NOT NULL UNIQUE,
  login_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  logout_at INTEGER
);
CREATE INDEX IF NOT EXISTS account_sessions_user_time ON account_sessions(account_id, login_at DESC);
CREATE INDEX IF NOT EXISTS accounts_registered ON accounts(created_at DESC, id);
CREATE TABLE IF NOT EXISTS account_activity (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  session_id TEXT NOT NULL REFERENCES account_sessions(id),
  occurred_at INTEGER NOT NULL,
  section TEXT NOT NULL,
  action TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_activity_user_time ON account_activity(account_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS account_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
