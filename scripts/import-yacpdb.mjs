import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase, setMetadata } from '../server/database.mjs';
import { parseEntry } from '../server/puzzleTools.mjs';

// Resumable import of the normal 100-entry public search pages.
// All original records are retained; only suitable orthodox #2s are playable.
const db = openDatabase();
const concurrency = Math.max(1, Math.min(4, Number(process.env.IMPORT_CONCURRENCY) || 4));
const query = "Stip('^#2$')";
const api = 'https://www.yacpdb.org/gateway/ql';
const save = db.prepare(`INSERT INTO puzzles(id,raw,puzzle,eligible,position_hash) VALUES(?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET raw=excluded.raw,
  puzzle=CASE WHEN puzzles.verified=1 THEN puzzles.puzzle ELSE excluded.puzzle END,
  eligible=CASE WHEN puzzles.verified=1 THEN 1 ELSE excluded.eligible END,
  position_hash=CASE WHEN puzzles.verified=1 THEN puzzles.position_hash ELSE excluded.position_hash END`);
let expected = 0;
let completed = 0;
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

async function fetchPage(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(`${api}?${new URLSearchParams({ q: query, p: String(page) })}`, {
        signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'ML-School-Local-Research/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.success || !Array.isArray(data.result?.entries) || !Number.isFinite(data.result.count)) throw new Error('Invalid search response');
      return data.result;
    } catch (error) {
      if (attempt === 5 || stopped) throw error;
      console.log(`Page ${page}: retry ${attempt + 1}: ${error.message}`);
      await delay(Math.min(60000, 3000 * 2 ** attempt));
    }
  }
}

function storePage(page, result) {
  db.exec('BEGIN');
  try {
    for (const entry of result.entries) {
      const puzzle = parseEntry(entry);
      save.run(String(entry.id), JSON.stringify(entry), puzzle ? JSON.stringify(puzzle) : null,
        puzzle ? 1 : 0, puzzle?.positionHash ?? null);
    }
    db.prepare('INSERT OR REPLACE INTO import_pages(page,count,fetched_at) VALUES(?,?,?)').run(page, result.entries.length, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  completed++;
}

try {
  setMetadata(db, 'import_status', { running: true, startedAt: new Date().toISOString() });
  const first = await fetchPage(1);
  expected = first.count;
  setMetadata(db, 'import_expected', expected);
  storePage(1, first);
  const pageSize = first.entries.length;
  if (!pageSize) throw new Error('Empty first page');
  const pages = Math.ceil(expected / pageSize);
  const existing = new Set(db.prepare('SELECT page FROM import_pages').all().map((row) => row.page));
  const pending = Array.from({ length: pages }, (_, index) => index + 1).filter((page) => !existing.has(page));
  completed = existing.size;
  console.log(`YACPDB #2: ${expected} records, ${pages} pages. Resuming with ${completed} cached pages.`);
  const report = () => {
    const counts = db.prepare('SELECT COUNT(*) AS imported, SUM(eligible) AS eligible FROM puzzles WHERE raw IS NOT NULL').get();
    console.log(JSON.stringify({ pages: completed, totalPages: pages, expected, ...counts }));
  };
  let next = 0;
  async function worker() {
    while (next < pending.length && !stopped) {
      const page = pending[next++];
      storePage(page, await fetchPage(page));
      if (completed % 25 === 0) report();
      await delay(350);
    }
  }
  const workers = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
    try { await worker(); } catch (error) { stopped = true; throw error; }
  }));
  const failure = workers.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  report();
  const count = db.prepare('SELECT COUNT(*) AS count FROM puzzles WHERE raw IS NOT NULL').get().count;
  const received = db.prepare('SELECT SUM(count) AS n FROM import_pages WHERE page<=?').get(pages).n;
  const complete = !stopped && completed === pages && received >= expected;
  setMetadata(db, 'import_status', { running: false, complete, imported: count, received, expected, pages: completed,
    duplicateRecords: Math.max(0, received - count), finishedAt: new Date().toISOString() });
  console.log(complete ? `Complete: all ${pages} search pages stored; ${received} received records, ${count} distinct IDs.`
    : 'Stopped or source changed: rerun npm run import:puzzles to resume/reconcile.');
} catch (error) {
  setMetadata(db, 'import_status', { running: false, complete: false, error: error.message });
  console.error(error);
  process.exitCode = 1;
} finally { db.close(); }
