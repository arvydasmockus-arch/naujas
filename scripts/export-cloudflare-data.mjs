import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultDatabasePath, defaultDataDirectory } from '../server/database.mjs';

const tables = [
  'puzzles', 'metadata', 'import_pages', 'daily', 'players', 'tournament_pool', 'tournaments',
  'daily_puzzles', 'attempts', 'tournament_problems', 'tournament_sessions', 'tournament_results',
];

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

const db = new DatabaseSync(defaultDatabasePath, { readOnly: true });
const outputPath = resolve(defaultDataDirectory, 'cloudflare-seed.sql');
mkdirSync(defaultDataDirectory, { recursive: true });
const chunks = ['-- Generated from the local ML Academy database. Keep this file private.'];
let total = 0;

try {
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    if (!columns.length) continue;
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    for (const row of rows) {
      const values = columns.map((column) => literal(row[column]));
      chunks.push(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
      total++;
    }
  }
  writeFileSync(outputPath, `${chunks.join('\n')}\n`, 'utf8');
  console.log(`Exported ${total} rows to ${outputPath}`);
  console.log('The judge key is intentionally excluded; set it with wrangler secret put JUDGE_KEY.');
} finally {
  db.close();
}
