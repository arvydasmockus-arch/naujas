import { Worker } from 'node:worker_threads';
import { openDatabase, setMetadata } from '../server/database.mjs';

// Keep a month of unused, fully checked diagrams ready ahead of daily rotation.
const db = openDatabase();
const target = 180;
let stopped = false;
let currentWorker;
process.on('SIGINT', () => { stopped = true; currentWorker?.terminate(); });
process.on('SIGTERM', () => { stopped = true; currentWorker?.terminate(); });
const spare = () => db.prepare(`SELECT COUNT(DISTINCT position_hash) AS n FROM puzzles p
  WHERE eligible=1 AND verified=1 AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.position_hash=p.position_hash)`).get().n;
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
    const row = db.prepare(`SELECT id,puzzle FROM puzzles p WHERE eligible=1 AND verified=0
      AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.position_hash=p.position_hash)
      ORDER BY RANDOM() LIMIT 1`).get();
    if (!row) break;
    const valid = await verify(JSON.parse(row.puzzle));
    if (stopped) break;
    db.prepare('UPDATE puzzles SET verified=? WHERE id=? AND verified=0').run(valid ? 1 : -1, row.id);
    checked++;
    if (checked % 10 === 0) console.log(`Verified reserve: ${spare()} / ${target}; checked ${checked} candidates.`);
  }
  const ready = spare();
  setMetadata(db, 'verified_reserve', { ready, target, updatedAt: new Date().toISOString() });
  console.log(`Verified reserve: ${ready} / ${target}.`);
} finally { db.close(); }
