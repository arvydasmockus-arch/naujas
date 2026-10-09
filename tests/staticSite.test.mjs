import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staticSite } from '../server/staticSite.mjs';

test('production website serves the built app and assets but cannot expose private paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ml-static-test-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<html>ML Academy</html>');
  writeFileSync(join(root, 'assets', 'app-123.js'), 'console.log("ML");');
  const server = createServer(staticSite(root));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const app = await fetch(`${base}/?page=training`);
    assert.equal(app.status, 200);
    assert.match(await app.text(), /ML Academy/);
    assert.equal(app.headers.get('cache-control'), 'no-cache');
    const script = await fetch(`${base}/assets/app-123.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    const head = await fetch(base, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    for (const path of ['/data/judge-key.txt', '/.env', '/server/dev.mjs', '/assets/missing.js', '/assets/%2e%2e%2f.env']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
