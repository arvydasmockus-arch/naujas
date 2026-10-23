import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultDatabasePath, defaultDataDirectory } from '../server/database.mjs';

const watch = process.argv.includes('--watch');
const api = (process.env.CLOUDFLARE_API_BASE || 'https://ml-academy-api.arvydasmockus.workers.dev').replace(/\/+$/, '');
const key = readFileSync(resolve(defaultDataDirectory, 'judge-key.txt'), 'utf8').trim();
const statePath = resolve(defaultDataDirectory, 'sprint-sync-state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { api, ids: [] };
const sent = new Set(state.api === api ? state.ids : []);
const db = new DatabaseSync(defaultDatabasePath, { readOnly: true });
async function sync() {
  const rows = db.prepare('SELECT * FROM sprint_candidates WHERE pieces>=15 ORDER BY id').all().filter((row) => !sent.has(row.id));
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const response = await fetch(api + '/api/admin/import', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sprintCandidates: batch }), signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sprint sync failed.');
    batch.forEach((row) => sent.add(row.id));
    writeFileSync(statePath, JSON.stringify({ api, ids: [...sent], updatedAt: new Date().toISOString() }, null, 2));
    console.log(`Sprint sync: ${sent.size} checked candidates sent.`);
  }
}
try {
  do {
    try { await sync(); } catch (error) { if (!watch) throw error; console.log(error.message); }
    if (watch) await new Promise((resolveDelay) => setTimeout(resolveDelay, 30000));
  } while (watch);
} finally { db.close(); }
