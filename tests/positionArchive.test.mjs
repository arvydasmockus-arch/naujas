import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.mjs';
import { d1Adapter } from '../server/d1Adapter.mjs';
import { accountApi } from '../server/accountAuth.mjs';
import { positionArchiveApi } from '../server/positionArchive.mjs';

function setup() {
  const db = openDatabase(':memory:', false);
  const messages = [];
  const env = { DB: d1Adapter(db), AUTH_SECRET: 'test-only-position-archive-secret-32-chars', ACCOUNTS_ENABLED: 'true',
    SEND_VERIFICATION: async (message) => messages.push(message) };
  const request = (path, method = 'GET', data, token) => new Request(`https://example.test${path}`, {
    method,
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-Player-Session': token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  async function createUser(username, email) {
    const signup = await accountApi(request('/api/accounts/register', 'POST', { username, email, password: 'test-password-123' }), env);
    const challenge = await signup.json();
    const verified = await accountApi(request('/api/accounts/verify', 'POST', { challengeId: challenge.challengeId, code: messages.at(-1).code }), env);
    return (await verified.json()).token;
  }
  return { db, env, request, createUser };
}

test('saved positions are private to their verified account and can be created, reopened and deleted', async (t) => {
  const app = setup();
  try {
    const firstToken = await app.createUser('Private One', 'private1@example.test');
    const secondToken = await app.createUser('Private Two', 'private2@example.test');
    const get = async (token) => positionArchiveApi(app.request('/api/positions', 'GET', undefined, token), app.env);
    const anonymous = await get(undefined);
    assert.equal(anonymous.status, 401);

    const saved = await positionArchiveApi(app.request('/api/positions', 'POST', {
      fen: '8/8/2pp4/3k1r2/2b1p1q1/4K3/N2B4/8 w - - 0 1', stipulation: 'h2',
    }, firstToken), app.env);
    assert.equal(saved.status, 201);
    const position = (await saved.json()).position;
    assert.equal(position.number, 1);
    assert.equal(position.stipulation, 'h#2');

    assert.deepEqual((await (await get(secondToken)).json()).positions, []);
    assert.equal((await positionArchiveApi(app.request(`/api/positions/${position.id}`, 'DELETE', undefined, secondToken), app.env)).status, 404);
    const firstArchive = await get(firstToken);
    assert.deepEqual((await firstArchive.json()).positions.map(({ number, fen, stipulation }) => ({ number, fen, stipulation })), [
      { number: 1, fen: '8/8/2pp4/3k1r2/2b1p1q1/4K3/N2B4/8 w - - 0 1', stipulation: 'h#2' },
    ]);

    const deleted = await positionArchiveApi(app.request(`/api/positions/${position.id}`, 'DELETE', undefined, firstToken), app.env);
    assert.equal(deleted.status, 200);
    assert.deepEqual((await (await get(firstToken)).json()).positions, []);
  } finally { t.mock.restoreAll(); app.db.close(); }
});

test('judge-only shared archive lists each saved position with its author', async (t) => {
  const app = setup();
  try {
    const firstToken = await app.createUser('Author One', 'author1@example.test');
    const secondToken = await app.createUser('Author Two', 'author2@example.test');
    for (const [token, fen] of [
      [firstToken, '4k3/8/8/8/8/8/8/4K3 w - - 0 1'],
      [secondToken, '4k3/8/8/8/8/8/8/4K3 b - - 0 1'],
    ]) {
      const saved = await positionArchiveApi(app.request('/api/positions', 'POST', { fen, stipulation: '#2' }, token), app.env);
      assert.equal(saved.status, 201);
    }

    const denied = await positionArchiveApi(app.request('/api/positions/shared'), app.env, false);
    assert.equal(denied.status, 401);
    const response = await positionArchiveApi(app.request('/api/positions/shared'), app.env, true);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).positions.map(({ author }) => author).sort(), ['Author One', 'Author Two']);
  } finally { t.mock.restoreAll(); app.db.close(); }
});

test('saved positions reject invalid positions and unsupported stipulations', async (t) => {
  const app = setup();
  try {
    const token = await app.createUser('Private User', 'private@example.test');
    for (const data of [
      { fen: 'not a fen', stipulation: '#2' },
      { fen: '8/8/8/8/8/8/8/8 w - - 0 1', stipulation: 'anything' },
    ]) {
      const response = await positionArchiveApi(app.request('/api/positions', 'POST', data, token), app.env);
      assert.equal(response.status, 400);
    }
  } finally { t.mock.restoreAll(); app.db.close(); }
});
