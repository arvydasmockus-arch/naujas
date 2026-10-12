import { Worker } from 'node:worker_threads';
import { openDatabase, setMetadata } from '../server/database.mjs';
import { hasPuzzleDefect } from '../server/puzzleTools.mjs';

// Keep a month of unused, fully checked diagrams ready ahead of daily rotation.
const db = openDatabase();
const target = 180;
let stopped = false;
let currentWorker;
process.on('SIGINT', () => { stopped = true; currentWorker?.terminate(); });
process.on('SIGTERM', () => { stopped = true; currentWorker?.terminate(); });
const spare = () => db.prepare(`SELECT COUNT(DISTINCT position_hash) AS n FROM puzzles p
  WHERE eligible=1 AND verified=1 AND verification_version=1
  AND length(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    substr(json_extract(puzzle,'$.fen'),1,instr(json_extract(puzzle,'$.fen'),' ')-1),
    '/',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''))>=9
  AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.position_hash=p.position_hash)`).get().n;
function verify(puzzle) {
  return new Promise((resolve) => {
    currentWorker = new Worker(new URL('../server/verifyWorker.mjs', import.meta.url), { workerData: puzzle });
    const timer = setTimeout(() => { currentWorker.terminate(); resolve(null); }, 90000);
    currentWorker.once('message', (valid) => { clearTimeout(timer); resolve(valid); });
    currentWorker.once('error', () => { clearTimeout(timer); resolve(null); });
    currentWorker.once('exit', () => { clearTimeout(timer); resolve(null); });
  });
}
try {
  let checked = 0;
  while (!stopped && spare() < target) {
    const row = db.prepare(`SELECT id,raw,puzzle FROM puzzles p WHERE eligible=1 AND verified>=0 AND verification_version=0
      AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.position_hash=p.position_hash)
      ORDER BY RANDOM() LIMIT 1`).get();
    if (!row) break;
    const puzzle = JSON.parse(row.puzzle);
    const pieces = puzzle.fen.split(' ')[0].replace(/[^a-z]/gi, '').length;
    const raw = row.raw ? JSON.parse(row.raw) : puzzle;
    const valid = pieces >= 9 && !hasPuzzleDefect(raw) ? await verify(puzzle) : false;
    if (pieces < 9) {
      db.prepare('UPDATE puzzles SET verification_version=1 WHERE id=?').run(row.id);
      continue;
    }
    if (valid === null) break;
    if (stopped) break;
    db.prepare('UPDATE puzzles SET verified=?,verification_version=1 WHERE id=? AND verification_version=0').run(valid ? 1 : -1, row.id);
    checked++;
    if (checked % 10 === 0) console.log(`Verified reserve: ${spare()} / ${target}; checked ${checked} candidates.`);
  }
  const ready = spare();
  setMetadata(db, 'verified_reserve', { ready, target, updatedAt: new Date().toISOString() });
  console.log(`Verified reserve: ${ready} / ${target}.`);
} finally { db.close(); }
