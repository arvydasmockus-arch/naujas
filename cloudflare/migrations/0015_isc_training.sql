CREATE TABLE IF NOT EXISTS isc_trainings (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  starts_at INTEGER NOT NULL,
  announced INTEGER NOT NULL DEFAULT 0,
  armed INTEGER NOT NULL DEFAULT 0,
  generate_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS isc_pdfs (
  tournament_id TEXT NOT NULL REFERENCES isc_trainings(tournament_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('problems','solutions')),
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY(tournament_id, kind)
);
CREATE TABLE IF NOT EXISTS isc_registrations (
  tournament_id TEXT NOT NULL REFERENCES isc_trainings(tournament_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  registered_at INTEGER NOT NULL,
  PRIMARY KEY(tournament_id, account_id)
);
CREATE TABLE IF NOT EXISTS isc_jobs (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES isc_trainings(tournament_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('generate','problems','solutions')),
  status TEXT NOT NULL DEFAULT 'pending',
  run_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS isc_jobs_due ON isc_jobs(run_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS isc_jobs_event ON isc_jobs(tournament_id);
CREATE TABLE IF NOT EXISTS isc_mail (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES isc_trainings(tournament_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('problems','solutions')),
  status TEXT NOT NULL DEFAULT 'pending',
  run_at INTEGER NOT NULL,
  first_attempt_at INTEGER,
  processing_token TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  UNIQUE(tournament_id, kind, account_id)
);
CREATE INDEX IF NOT EXISTS isc_mail_due ON isc_mail(run_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS isc_mail_event ON isc_mail(tournament_id);
