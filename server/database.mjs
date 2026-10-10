import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const defaultDataDirectory = resolve(process.env.DATA_DIR || 'data');
export const defaultDatabasePath = resolve(defaultDataDirectory, 'solving.sqlite');

export function openDatabase(path = defaultDatabasePath, seed = true) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 15000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS puzzles (
      id TEXT PRIMARY KEY, raw TEXT, puzzle TEXT, eligible INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 0, position_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS puzzle_selection ON puzzles(eligible, verified);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS import_pages (page INTEGER PRIMARY KEY, count INTEGER NOT NULL, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS puzzle_training_difficulty (
      puzzle_id TEXT PRIMARY KEY, hard INTEGER NOT NULL, pieces INTEGER NOT NULL, alternative_moves INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily (date TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS daily_puzzles (
      date TEXT NOT NULL REFERENCES daily(date), ordinal INTEGER NOT NULL,
      puzzle_id TEXT NOT NULL REFERENCES puzzles(id), position_hash TEXT NOT NULL UNIQUE,
      PRIMARY KEY(date,ordinal)
    );
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (
      player_id TEXT NOT NULL REFERENCES players(id), date TEXT NOT NULL REFERENCES daily(date), ordinal INTEGER NOT NULL,
      started_at INTEGER NOT NULL, answered_at INTEGER, seconds INTEGER, move TEXT, san TEXT, correct INTEGER,
      reopens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(player_id,date,ordinal)
    );`);
  if (seed) {
    const puzzles = JSON.parse(readFileSync(new URL('../src/solvingPuzzles.json', import.meta.url), 'utf8'));
    const insert = db.prepare('INSERT OR IGNORE INTO puzzles(id,puzzle,eligible,verified,position_hash) VALUES(?,?,1,1,?)');
    db.exec('BEGIN');
    try {
      for (const puzzle of puzzles) insert.run(puzzle.id, JSON.stringify(puzzle), createHash('sha256').update(puzzle.fen).digest('hex'));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return db;
}

export function setMetadata(db, key, value) {
  db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
}

export function getMetadata(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM metadata WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}
