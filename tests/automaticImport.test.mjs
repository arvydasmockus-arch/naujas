import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

test('scheduled importer resumes missing rows next day, verifies source and finishes without duplicates', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'ml-automatic-import-'));
  const rows = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), raw: '{}', puzzle: null }));
  const compressed = gzipSync(rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const manifest = { formatVersion: 1, file: 'puzzles.ndjson.gz', expected: 6,
    sha256: createHash('sha256').update(compressed).digest('hex') };
  writeFileSync(resolve(directory, manifest.file), compressed);
  writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest));
  const existing = new Set(['1']);
  let remaining = 17;
  let refreshExpected;
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    let result;
    if (data.automaticImportStatus) result = { remaining };
    else if (data.listExisting) result = { ids: [...existing].filter((id) => id > data.after).sort().slice(0, data.limit) };
    else if (data.refreshLibraryStatus) { refreshExpected = data.expected; result = {}; }
    else if (data.automatic) {
      const inserted = data.puzzles.filter((row) => !existing.has(row.id));
      inserted.forEach((row) => existing.add(row.id));
      const rowsWritten = inserted.length * 3;
      remaining -= rowsWritten + 4;
      result = { receivedPuzzles: data.puzzles.length, rowsWritten };
    } else throw new Error('Unexpected request');
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  async function run() {
    const child = spawn(process.execPath, ['scripts/automatic-puzzle-import.mjs'], {
      env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', IMPORT_SOURCE_DIR: directory,
        IMPORT_JUDGE_KEY: 'test-key', CLOUDFLARE_API_BASE: 'http://127.0.0.1:' + server.address().port },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = ''; child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const [code] = await once(child, 'close'); return { code, output };
  }
  try {
    const first = await run();
    assert.equal(first.code, 0, first.output);
    assert.match(first.output, /"complete":false/);
    assert.equal(existing.size, 4);
    const paused = await run();
    assert.equal(paused.code, 0, paused.output);
    assert.equal(existing.size, 4);
    remaining = 404;
    writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify({ ...manifest, sha256: 'invalid' }));
    const corrupt = await run();
    assert.notEqual(corrupt.code, 0);
    assert.match(corrupt.output, /checksum mismatch/);
    assert.equal(existing.size, 4);
    writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest));
    const second = await run();
    assert.equal(second.code, 0, second.output);
    assert.match(second.output, /"complete":true/);
    assert.equal(existing.size, 6);
    assert.equal(refreshExpected, 6);
    assert.match((await run()).output, /"inserted":0/);
  } finally { server.close(); rmSync(directory, { recursive: true, force: true }); }
});
