import { Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { openDatabase, defaultDataDirectory } from '../server/database.mjs';
import { sprintCandidates, localSprintDate, sprintDifficulty } from '../server/sprintSelection.mjs';

const db = openDatabase(undefined, false);
db.exec(readFileSync(new URL('../cloudflare/migrations/0010_sprint_candidates.sql', import.meta.url), 'utf8'));
db.exec('CREATE TABLE IF NOT EXISTS sprint_candidate_checks(hash TEXT PRIMARY KEY,id TEXT NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL)');
const target = process.argv[2] ? Math.max(3, Number(process.argv[2])) : Infinity;
if (Number.isNaN(target)) throw new Error('Invalid reserve size.');
const rows = db.prepare('SELECT id,raw,puzzle,verified,verification_version FROM puzzles WHERE eligible=1 AND verified>=0 AND raw IS NOT NULL').all();
const trusted = new Set(rows.filter((row) => row.verified === 1 && row.verification_version === 1).map((row) => row.id));
const candidates = sprintCandidates(rows, localSprintDate()).filter((puzzle) => puzzle.pieces >= 15)
  .map((puzzle) => ({ ...puzzle, auditHash: createHash('sha256').update(puzzle.fen + ':' + puzzle.key).digest('hex') }));
const checked = new Map(db.prepare('SELECT hash,status FROM sprint_candidate_checks').all().map((row) => [row.hash, row.status]));
const save = db.prepare('INSERT INTO sprint_candidates(id,puzzle,position_hash,pieces,wrong_key_tries,publication_date) VALUES(?,?,?,?,?,?) '
  + 'ON CONFLICT(id) DO UPDATE SET puzzle=excluded.puzzle,position_hash=excluded.position_hash,pieces=excluded.pieces,wrong_key_tries=excluded.wrong_key_tries,publication_date=excluded.publication_date');
const saveCheck = db.prepare('INSERT OR REPLACE INTO sprint_candidate_checks VALUES(?,?,?,?)');
let index = 0, processed = 0;
function persist(puzzle, status) {
  db.exec('BEGIN');
  try {
    saveCheck.run(puzzle.auditHash, puzzle.id, status, new Date().toISOString());
    if (status === 'valid') {
      const data = { ...puzzle, ...sprintDifficulty(puzzle) };
      delete data.auditHash;
      save.run(data.id, JSON.stringify(data), data.positionHash, data.pieces, data.wrongKeyTries, data.publicationDate);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
for (const puzzle of candidates) {
  if (trusted.has(puzzle.id) || checked.get(puzzle.auditHash) === 'valid') persist(puzzle, 'valid');
}
const groups = [candidates.filter((p) => p.pieces < 20), candidates.filter((p) => p.pieces >= 20)];
const pending = [];
for (let i = 0; i < Math.max(...groups.map((group) => group.length)); i++) {
  for (const group of groups) {
    const puzzle = group[i];
    if (puzzle && !trusted.has(puzzle.id) && !['valid', 'invalid'].includes(checked.get(puzzle.auditHash))) pending.push(puzzle);
  }
}
function report(complete = false) {
  const counts = db.prepare("SELECT CASE WHEN pieces<20 THEN '15-19' ELSE '20+' END AS tier,COUNT(*) AS count FROM sprint_candidates WHERE pieces>=15 GROUP BY tier").all();
  const statuses = db.prepare('SELECT status,COUNT(*) AS count FROM sprint_candidate_checks GROUP BY status').all();
  const result = { updatedAt: new Date().toISOString(), candidates: candidates.length, processed, remaining: pending.length - processed, complete, counts, statuses };
  writeFileSync(resolve(defaultDataDirectory, 'sprint-candidate-progress.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
async function lane() {
  const spawn = () => new Worker(new URL('../server/verifyWorker.mjs', import.meta.url));
  let worker = spawn();
  try {
    while (index < pending.length && db.prepare('SELECT COUNT(*) AS n FROM sprint_candidates').get().n < target) {
      const puzzle = pending[index++];
      const status = await new Promise((resolveResult) => {
        const done = (value) => {
          clearTimeout(timer);
          worker.removeAllListeners('message'); worker.removeAllListeners('error'); worker.removeAllListeners('exit');
          resolveResult(value);
        };
        const timer = setTimeout(() => done('timeout'), 90000);
        worker.once('message', (valid) => done(valid ? 'valid' : 'invalid'));
        worker.once('error', () => done('error'));
        worker.once('exit', () => done('error'));
        worker.postMessage(puzzle);
      });
      persist(puzzle, status); processed++;
      if (status === 'timeout' || status === 'error') { await worker.terminate(); worker = spawn(); }
    }
  } finally { await worker.terminate(); }
}
report();
const timer = setInterval(() => report(), 30000);
try {
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, availableParallelism() - 1)) }, () => lane()));
  report(processed === pending.length && !db.prepare("SELECT 1 FROM sprint_candidate_checks WHERE status IN ('timeout','error') LIMIT 1").get());
} finally { clearInterval(timer); db.close(); }
