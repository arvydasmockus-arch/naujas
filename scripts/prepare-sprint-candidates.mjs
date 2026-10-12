import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.mjs';
import { sprintCandidates, localSprintDate } from '../server/sprintSelection.mjs';

const db = openDatabase(undefined, false);
db.exec(readFileSync(new URL('../cloudflare/migrations/0010_sprint_candidates.sql', import.meta.url), 'utf8'));
const target = Math.max(3, Number(process.argv[2]) || 90);
const used = new Set(db.prepare('SELECT position_hash FROM sprint_puzzles UNION SELECT position_hash FROM sprint_retired_positions').all().map((row) => row.position_hash));
const rows = db.prepare('SELECT p.id,p.raw,p.puzzle,p.verified,p.verification_version FROM puzzles p WHERE eligible=1 AND verified>=0 AND raw IS NOT NULL '
  + 'AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.puzzle_id=p.id) '
  + 'AND NOT EXISTS(SELECT 1 FROM sprint_puzzles d WHERE d.puzzle_id=p.id) '
  + 'AND NOT EXISTS(SELECT 1 FROM sprint_retired_positions d WHERE d.puzzle_id=p.id) '
  + "AND NOT EXISTS(SELECT 1 FROM tournament_problems t WHERE json_extract(t.puzzle,'$.id')=p.id)").all();
const trusted = new Set(rows.filter((row) => row.verified === 1 && row.verification_version === 1).map((row) => row.id));
const candidates = sprintCandidates(rows, localSprintDate(), used);
const existing = new Set(db.prepare('SELECT position_hash FROM sprint_candidates').all().map((row) => row.position_hash));
const save = db.prepare('INSERT OR IGNORE INTO sprint_candidates(id,puzzle,position_hash,pieces,wrong_key_tries,publication_date) VALUES(?,?,?,?,?,?)');
let ready = 0, checked = 0;
function verify(puzzle) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('../server/verifyWorker.mjs', import.meta.url), { workerData: puzzle });
    const timer = setTimeout(() => { void worker.terminate(); resolve(false); }, 90000);
    worker.once('message', (valid) => { clearTimeout(timer); resolve(valid); });
    worker.once('error', () => { clearTimeout(timer); resolve(false); });
    worker.once('exit', () => { clearTimeout(timer); resolve(false); });
  });
}
try {
  for (const puzzle of candidates) {
    if (existing.has(puzzle.positionHash)) { ready++; }
    else {
      const valid = trusted.has(puzzle.id) || await verify(puzzle);
      checked++;
      if (valid) { save.run(puzzle.id, JSON.stringify(puzzle), puzzle.positionHash, puzzle.pieces, puzzle.wrongKeyTries, puzzle.publicationDate); ready++; }
    }
    if (checked % 5 === 0) console.log(`Sprint reserve: ${ready}/${target}; checked ${checked}.`);
    if (ready >= target) break;
  }
  console.log(JSON.stringify({ ready, checked, target, qualifyingCandidates: candidates.length }));
  if (ready < 3) process.exitCode = 1;
} finally { db.close(); }
