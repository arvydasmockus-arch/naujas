import { openDatabase, setMetadata } from '../server/database.mjs';
import { tournamentTypes, tournamentQueries, parseTournamentEntry } from '../server/tournamentTools.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const db = openDatabase();
db.exec(`CREATE TABLE IF NOT EXISTS tournament_pool(id TEXT PRIMARY KEY,type TEXT NOT NULL,raw TEXT NOT NULL,
  puzzle TEXT NOT NULL,position_hash TEXT NOT NULL,checked_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS tournament_pool_type ON tournament_pool(type);`);
const save = db.prepare('INSERT OR REPLACE INTO tournament_pool VALUES(?,?,?,?,?,?)');
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
try {
  for (const [index, type] of tournamentTypes.entries()) {
    if (stopped) break;
    let accepted = 0;
    // Small separate pool; this does not resume the paused full #2 import.
    for (let page = 1; page <= 5 && accepted < 60 && !stopped; page++) {
      const q = `Stip('${tournamentQueries[index]}') AND NOT ReprintType('solving event')`;
      let result;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const response = await fetch(`https://www.yacpdb.org/gateway/ql?${new URLSearchParams({ q, p: String(page) })}`,
            { signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error(`YACPDB HTTP ${response.status}`);
          const data = await response.json();
          if (!data.success) throw new Error(JSON.stringify(data));
          result = data.result; break;
        } catch (error) { if (attempt === 3) throw error; await delay(2500 * (attempt + 1)); }
      }
      if (!result.entries.length) break;
      db.exec('BEGIN');
      try {
        for (const entry of result.entries) {
          const puzzle = parseTournamentEntry(entry);
          if (!puzzle || puzzle.type !== type) {
            db.prepare('DELETE FROM tournament_pool WHERE id=?').run(String(entry.id));
            continue;
          }
          save.run(puzzle.id, type, JSON.stringify(entry), JSON.stringify(puzzle), puzzle.positionHash, puzzle.usageCheckedAt);
          accepted++;
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      await delay(500);
    }
    console.log(`${type}: ${accepted} eligible records imported.`);
  }
  setMetadata(db, 'tournament_import', { finishedAt: new Date().toISOString(), stopped });
  console.log(JSON.stringify(db.prepare('SELECT type,COUNT(*) AS count FROM tournament_pool GROUP BY type').all()));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
