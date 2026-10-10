import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase, setMetadata } from '../server/database.mjs';
import { tournamentTypes, tournamentQueries, parseTournamentEntry } from '../server/tournamentTools.mjs';

const TARGET_PER_TYPE = 1000;
const checkedAt = new Date().toISOString();
const api = 'https://www.yacpdb.org/gateway/ql';
const db = openDatabase();
db.exec(`CREATE TABLE IF NOT EXISTS tournament_pool(id TEXT PRIMARY KEY,type TEXT NOT NULL,raw TEXT NOT NULL,
  puzzle TEXT NOT NULL,position_hash TEXT NOT NULL,checked_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS tournament_pool_type ON tournament_pool(type);
  CREATE TABLE IF NOT EXISTS tournament_import_pages(type TEXT NOT NULL,page INTEGER NOT NULL,count INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,PRIMARY KEY(type,page));`);

const save = db.prepare(`INSERT INTO tournament_pool(id,type,raw,puzzle,position_hash,checked_at) VALUES(?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET type=excluded.type,raw=excluded.raw,puzzle=excluded.puzzle,
  position_hash=excluded.position_hash,checked_at=excluded.checked_at`);
const remove = db.prepare('DELETE FROM tournament_pool WHERE id=? AND type=?');
const recordPage = db.prepare(`INSERT INTO tournament_import_pages(type,page,count,fetched_at) VALUES(?,?,?,?)
  ON CONFLICT(type,page) DO UPDATE SET count=excluded.count,fetched_at=excluded.fetched_at`);
const denseTypes = new Set(['#2', '#3', '#n', 's#n']);
const validForPool = (entry, expectedType) => {
  const puzzle = parseTournamentEntry(entry, checkedAt);
  if (!puzzle || puzzle.type !== expectedType) return null;
  if (denseTypes.has(expectedType) && puzzle.whiteCount + puzzle.blackCount <= 15) return null;
  return puzzle;
};
const hashesByType = new Map(tournamentTypes.map((type) => [type, new Map()]));
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

async function fetchPage(query, page) {
  let lastError;
  for (let attempt = 0; attempt < 6 && !stopped; attempt++) {
    try {
      const response = await fetch(`${api}?${new URLSearchParams({ q: query, p: String(page) })}`,
        { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'ML-Academy-Tournament-Pool/1.0' } });
      if (!response.ok) throw new Error(`YACPDB HTTP ${response.status}`);
      const data = await response.json();
      if (!data.success || !Array.isArray(data.result?.entries) || !Number.isFinite(data.result.count))
        throw new Error('Invalid YACPDB search response.');
      return data.result;
    } catch (error) {
      lastError = error;
      if (attempt < 5 && !stopped) await delay(Math.min(60000, 3000 * 2 ** attempt));
    }
  }
  if (stopped) return null;
  throw lastError;
}

function eligibleCount(type) { return hashesByType.get(type).size; }

try {
  // Recheck old pool records against today's five-year, solution, defect and density rules.
  const rows = db.prepare('SELECT id,type,raw FROM tournament_pool').all();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const puzzle = validForPool(JSON.parse(row.raw), row.type);
      const owners = hashesByType.get(row.type);
      if (!puzzle || !owners || owners.has(puzzle.positionHash)) {
        remove.run(row.id, row.type);
        continue;
      }
      owners.set(puzzle.positionHash, row.id);
      save.run(puzzle.id, puzzle.type, row.raw, JSON.stringify(puzzle), puzzle.positionHash, checkedAt);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }

  setMetadata(db, 'tournament_import', { running: true, startedAt: checkedAt, targetPerType: TARGET_PER_TYPE });
  for (const [index, type] of tournamentTypes.entries()) {
    if (stopped) break;
    const query = `Stip('${tournamentQueries[index]}') AND NOT ReprintType('solving event')`;
    const completedPage = db.prepare('SELECT MAX(page) AS page FROM tournament_import_pages WHERE type=?').get(type).page ?? 0;
    let first = await fetchPage(query, completedPage + 1);
    if (!first && stopped) break;
    if (!first) throw new Error(`Could not load YACPDB page ${completedPage + 1} for ${type}.`);
    const pageSize = Math.max(first.entries.length, 1);
    const totalPages = Math.ceil(first.count / pageSize);
    let page = completedPage + 1;
    let result = first;

    while (!stopped && eligibleCount(type) < TARGET_PER_TYPE && page <= totalPages) {
      if (page !== completedPage + 1) result = await fetchPage(query, page);
      if (!result || !result.entries.length) break;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const entry of result.entries) {
          const id = String(entry.id ?? '');
          const puzzle = validForPool(entry, type);
          if (!puzzle) { if (id) remove.run(id, type); continue; }
          const owners = hashesByType.get(type);
          const owner = owners.get(puzzle.positionHash);
          if (owner && owner !== puzzle.id) { remove.run(puzzle.id, type); continue; }
          owners.set(puzzle.positionHash, puzzle.id);
          save.run(puzzle.id, type, JSON.stringify(entry), JSON.stringify(puzzle), puzzle.positionHash, checkedAt);
        }
        recordPage.run(type, page, result.entries.length, checkedAt);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      if (page % 10 === 0 || eligibleCount(type) >= TARGET_PER_TYPE || page === totalPages)
        console.log(`${type}: ${eligibleCount(type)}/${TARGET_PER_TYPE} distinct eligible positions (${page}/${totalPages} pages).`);
      page++;
      if (eligibleCount(type) < TARGET_PER_TYPE && page <= totalPages) await delay(350);
    }
    console.log(`${type}: ${eligibleCount(type)}/${TARGET_PER_TYPE}${eligibleCount(type) < TARGET_PER_TYPE ? ' (YACPDB search exhausted)' : ''}.`);
  }

  const counts = Object.fromEntries(tournamentTypes.map((type) => [type, eligibleCount(type)]));
  const complete = !stopped && tournamentTypes.every((type) => counts[type] >= TARGET_PER_TYPE);
  setMetadata(db, 'tournament_import', { running: false, complete, stopped, targetPerType: TARGET_PER_TYPE, counts, finishedAt: new Date().toISOString() });
  console.log(JSON.stringify({ complete, stopped, targetPerType: TARGET_PER_TYPE, counts }));
} catch (error) {
  setMetadata(db, 'tournament_import', { running: false, complete: false, targetPerType: TARGET_PER_TYPE, error: error.message, counts: Object.fromEntries(tournamentTypes.map((type) => [type, eligibleCount(type)])) });
  console.error(error);
  process.exitCode = 1;
} finally { db.close(); }
