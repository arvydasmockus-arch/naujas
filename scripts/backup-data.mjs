import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { defaultDatabasePath } from '../server/database.mjs';

const target = resolve(process.argv[2] || `data/backups/ml-academy-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
if (target === defaultDatabasePath || existsSync(target)) throw new Error('Backup must be a new file separate from the live database.');
if (!existsSync(defaultDatabasePath)) throw new Error('Source database does not exist.');
mkdirSync(dirname(target), { recursive: true });
const db = new DatabaseSync(defaultDatabasePath, { timeout: 15000 });
try {
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  console.log(`Private database backup: ${target}`);
} finally { db.close(); }
