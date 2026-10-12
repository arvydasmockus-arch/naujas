import { createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, defaultDataDirectory } from '../server/database.mjs';

const directory = resolve(defaultDataDirectory, 'automatic-import');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, 'puzzles.ndjson.gz');
const db = new DatabaseSync(defaultDatabasePath, { readOnly: true });
let count = 0;
try {
  // Explicitly export puzzle data only; sessions, player names and keys stay local.
  const rows = db.prepare(`SELECT id,raw,puzzle,eligible,verified,position_hash,verification_version
    FROM puzzles WHERE raw IS NOT NULL ORDER BY (verified=1 AND verification_version=1) DESC,CAST(id AS INTEGER)`);
  const gzip = createGzip();
  const finished = pipeline(gzip, createWriteStream(path));
  for (const row of rows.iterate()) {
    if (!gzip.write(JSON.stringify(row) + '\n')) await once(gzip, 'drain');
    count++;
  }
  gzip.end();
  await finished;
  const manifest = { formatVersion: 1, file: 'puzzles.ndjson.gz', expected: count,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), bytes: statSync(path).size };
  writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest));
} finally { db.close(); }
