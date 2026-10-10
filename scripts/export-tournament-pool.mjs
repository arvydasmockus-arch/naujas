import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultDatabasePath, defaultDataDirectory } from '../server/database.mjs';
import { tournamentTypes } from '../server/tournamentTools.mjs';

const fileNames = { '#2': 'mate-in-2', '#3': 'mate-in-3', '#n': 'longmates', study: 'studies', 's#n': 'selfmates', 'h#n': 'helpmates' };
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

const outputDirectory = resolve(defaultDataDirectory, 'cloudflare-tournament-pool');
mkdirSync(outputDirectory, { recursive: true });
const db = new DatabaseSync(defaultDatabasePath, { readOnly: true });
try {
  for (const type of tournamentTypes) {
    const rows = db.prepare('SELECT id,type,raw,puzzle,position_hash,checked_at FROM tournament_pool WHERE type=? ORDER BY id').all(type);
    const statements = [];
    for (let start = 0; start < rows.length; start += 2) {
      const values = rows.slice(start, start + 2).map((row) =>
        `(${[row.id,row.type,row.raw,row.puzzle,row.position_hash,row.checked_at].map(literal).join(',')})`);
      statements.push(`INSERT OR IGNORE INTO tournament_pool(id,type,raw,puzzle,position_hash,checked_at) VALUES\n${values.join(',\n')};`);
    }
    const path = resolve(outputDirectory, `${fileNames[type]}.sql`);
    writeFileSync(path, `${statements.join('\n')}\n`, 'utf8');
    console.log(`${type}: ${rows.length} rows -> ${path}`);
  }
} finally { db.close(); }
