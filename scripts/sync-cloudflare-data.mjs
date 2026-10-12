import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, defaultDataDirectory } from '../server/database.mjs';

const apiBase = (process.env.CLOUDFLARE_API_BASE || 'https://ml-academy-api.arvydasmockus.workers.dev').replace(/\/+$/, '');
const judgeKey = readFileSync(resolve(defaultDataDirectory, 'judge-key.txt'), 'utf8').trim();
const maxPuzzleRowsWritten = Number(process.env.MAX_PUZZLE_ROWS_WRITTEN) || 26000;
const db = new DatabaseSync(defaultDatabasePath, { readOnly: true });

async function call(data) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`${apiBase}/api/admin/import`, {
        method: 'POST', headers: { Authorization: `Bearer ${judgeKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data), signal: AbortSignal.timeout(120000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Import endpoint returned ${response.status}.`);
      return result;
    } catch (error) {
      if (attempt === 4) throw error;
      console.log(`Retrying an idempotent batch (${attempt + 1}/4): ${error.message}`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000 * (attempt + 1)));
    }
  }
}

async function existingIds(table) {
  const ids = new Set();
  let after = '';
  while (true) {
    const result = await call({ listExisting: table, limit: 5000, after });
    for (const id of result.ids) ids.add(String(id));
    after = String(result.ids.at(-1) ?? after);
    console.log(`${table}: ${ids.size} existing IDs checked`);
    if (result.ids.length < 5000) return ids;
  }
}

async function sendTournamentRows(existing) {
  let batch = [];
  let sent = 0;
  let written = 0;
  async function flush() {
    if (!batch.length) return;
    const result = await call({ tournamentPool: batch });
    sent += result.receivedTournamentRows;
    written += result.rowsWritten;
    batch = [];
    console.log(`Tournament pool: sent ${sent}, D1 row writes ${written}`);
  }
  const rows = db.prepare('SELECT id,type,raw,puzzle,position_hash,checked_at FROM tournament_pool ORDER BY type,id');
  for (const row of rows.iterate()) {
    if (existing.has(String(row.id))) continue;
    batch.push(row);
    if (batch.length === 10) await flush();
  }
  await flush();
  return written;
}

async function sendPuzzleRows(existing) {
  let batch = [];
  let written = 0;
  let sent = 0;
  async function flush() {
    if (!batch.length) return;
    const result = await call({ puzzles: batch });
    sent += result.receivedPuzzles;
    written += result.rowsWritten;
    batch = [];
    console.log(`Puzzles: submitted ${sent}, D1 row writes ${written}/${maxPuzzleRowsWritten}`);
  }
  const rows = db.prepare(`SELECT id,raw,puzzle,eligible,verified,position_hash,verification_version FROM puzzles
    ORDER BY (verified=1 AND verification_version=1) DESC,CAST(id AS INTEGER)`);
  for (const row of rows.iterate()) {
    if (existing.has(String(row.id))) continue;
    const remainingRows = Math.floor((maxPuzzleRowsWritten - written) / 4);
    if (remainingRows <= 0) break;
    batch.push(row);
    if (batch.length >= Math.min(100, remainingRows)) await flush();
  }
  await flush();
  return written;
}

try {
  const [puzzleIds, tournamentIds] = await Promise.all([existingIds('puzzles'), existingIds('tournament_pool')]);
  let reserveWrites = 0;
  const updates = db.prepare('SELECT id,position_hash FROM puzzles WHERE verified=1 AND verification_version=1').all().filter((row) => puzzleIds.has(row.id));
  for (let index = 0; index < updates.length; index += 100) reserveWrites += (await call({ verifiedUpdates: updates.slice(index,index+100) })).rowsWritten;
  const candidates = db.prepare('SELECT * FROM sprint_candidates').all();
  for (let index = 0; index < candidates.length; index += 100) reserveWrites += (await call({ sprintCandidates: candidates.slice(index,index+100) })).rowsWritten;
  const rounds = db.prepare('SELECT date,created_at FROM sprint_days ORDER BY date').all().map((round) => ({ ...round,
    puzzles: db.prepare('SELECT * FROM sprint_puzzles WHERE date=? ORDER BY ordinal').all(round.date),
    sessions: db.prepare('SELECT * FROM sprint_sessions WHERE date=?').all(round.date),
  }));
  for (const round of rounds) reserveWrites += (await call({ sprintRounds: [round] })).rowsWritten;
  const tournamentWrites = await sendTournamentRows(tournamentIds);
  const puzzleWrites = await sendPuzzleRows(puzzleIds);
  const expected = db.prepare('SELECT COUNT(*) AS n FROM puzzles WHERE raw IS NOT NULL').get().n;
  const status = await call({ refreshLibraryStatus: true, expected });
  const report = { timestamp: new Date().toISOString(), expected, tournamentWrites, reserveWrites, puzzleWrites,
    originalRemotePuzzles: puzzleIds.size, localSprintCandidates: candidates.length, localSprintRounds: rounds.length,
    status: status.libraryStatus ?? 'refreshed' };
  writeFileSync(resolve(defaultDataDirectory, 'last-cloudflare-sync.json'), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
