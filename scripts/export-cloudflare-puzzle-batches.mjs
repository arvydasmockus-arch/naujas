import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, defaultDataDirectory } from '../server/database.mjs';

const rowsPerFile = 2000;
const rowsPerStatement = 5;
const outputDirectory = resolve(defaultDataDirectory, 'cloudflare-puzzle-sync');
const db = new DatabaseSync(defaultDatabasePath, { readOnly: true });

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

try {
  mkdirSync(outputDirectory, { recursive: true });
  const total = db.prepare('SELECT COUNT(*) AS n FROM puzzles').get().n;
  const select = db.prepare(`SELECT id,raw,puzzle,eligible,verified,position_hash FROM puzzles
    ORDER BY CAST(id AS INTEGER) LIMIT ? OFFSET ?`);
  for (let offset = 0, batch = 0; offset < total; offset += rowsPerFile, batch++) {
    const rows = select.all(rowsPerFile, offset);
    const statements = [];
    for (let start = 0; start < rows.length; start += rowsPerStatement) {
      const values = rows.slice(start, start + rowsPerStatement).map((row) =>
        `(${[row.id,row.raw,row.puzzle,row.eligible,row.verified,row.position_hash].map(literal).join(',')})`);
      statements.push(`INSERT OR IGNORE INTO puzzles(id,raw,puzzle,eligible,verified,position_hash) VALUES ${values.join(',')};`);
    }
    const path = resolve(outputDirectory, `puzzles-${String(batch).padStart(3, '0')}.sql`);
    writeFileSync(path, `${statements.join('\n')}\n`, 'utf8');
    console.log(`${offset + rows.length}/${total} -> ${path}`);
  }
  console.log(`Prepared ${Math.ceil(total / rowsPerFile)} idempotent batches for ${total} local puzzle rows.`);
} finally {
  db.close();
}
