import { appendFileSync, createReadStream, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const base = (process.env.CLOUDFLARE_API_BASE || 'https://ml-academy-api.arvydasmockus.workers.dev').replace(/\/+$/, '');
const key = process.env.IMPORT_JUDGE_KEY;
if (!key) throw new Error('IMPORT_JUDGE_KEY is required.');
const directory = resolve(process.env.IMPORT_SOURCE_DIR || 'data/automatic-import');

async function call(data) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(base + '/api/admin/import', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data), signal: AbortSignal.timeout(120000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`Import failed (${response.status}): ${result.error || 'Unknown error'}`);
      return result;
    } catch (error) {
      if (attempt === 4) throw error;
      console.log(`Retry ${attempt + 1}/4: ${error.message}`);
      await new Promise((done) => setTimeout(done, (attempt + 1) * 3000));
    }
  }
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

const budget = await call({ automaticImportStatus: true });
console.log(JSON.stringify({ budget }));
output('ready', budget.remaining >= 8);
if (process.argv.includes('--status')) process.exit(0);
if (budget.remaining < 8) {
  console.log('Šios dienos importo limitas išnaudotas. Importas tęsis kitą dieną.');
  output('complete', false);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
if (manifest.formatVersion !== 1 || manifest.file !== 'puzzles.ndjson.gz' || !Number.isInteger(manifest.expected) || manifest.expected < 1)
  throw new Error('Invalid source manifest.');
const path = resolve(directory, manifest.file);
const hash = createHash('sha256');
for await (const chunk of createReadStream(path)) hash.update(chunk);
if (hash.digest('hex') !== manifest.sha256) throw new Error('Source checksum mismatch.');

const existing = new Set();
let after = '';
while (true) {
  const result = await call({ listExisting: 'puzzles', after, limit: 5000 });
  for (const id of result.ids) existing.add(String(id));
  after = String(result.ids.at(-1) ?? after);
  if (result.ids.length < 5000) break;
}

let remaining = budget.remaining;
let inserted = 0;
let written = 0;
let seen = 0;
let stopped = false;
let batch = [];
async function flush() {
  if (!batch.length) return;
  const result = await call({ automatic: true, puzzles: batch });
  if (result.paused) { stopped = true; batch = []; return; }
  inserted += result.receivedPuzzles;
  written += result.rowsWritten;
  remaining -= result.rowsWritten + 4;
  batch = [];
  console.log(`Imported ${inserted} puzzles; ${written} puzzle row writes.`);
}

const input = createReadStream(path).pipe(createGunzip());
const lines = createInterface({ input, crlfDelay: Infinity });
try {
  for await (const line of lines) {
    seen++;
    const row = JSON.parse(line);
    if (existing.has(String(row.id))) continue;
    const capacity = Math.min(100, Math.floor((remaining - 4) / 4));
    if (capacity < 1 || stopped) { stopped = true; break; }
    batch.push(row);
    if (batch.length >= capacity) await flush();
    if (stopped) break;
  }
  await flush();
} finally { lines.close(); input.destroy(); }

if (!stopped && seen !== manifest.expected) throw new Error('Source row count differs from manifest.');
await call({ refreshLibraryStatus: true, expected: manifest.expected });
const complete = !stopped && seen === manifest.expected;
const report = { timestamp: new Date().toISOString(), inserted, written, complete, sourceRows: manifest.expected };
output('complete', complete);
console.log(JSON.stringify(report));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `Importuota: **${inserted}** uždavinių. Įrašymo operacijų: **${written}**. ${complete ? 'Visa bazė importuota.' : 'Importas tęsis kitą dieną.'}\n`);
