import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.mjs';
import { d1Adapter } from '../server/d1Adapter.mjs';
import { accountApi, authorizeGameRequest, currentAccount, recordAccountActivity } from '../server/accountAuth.mjs';
import { normalizePlayer } from '../server/gameStore.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { SprintStore } from '../server/sprintStore.mjs';

function setup() {
  const db = openDatabase(':memory:', false);
  new TournamentStore(db); new SprintStore(db);
  const mail = [];
  const env = { DB: d1Adapter(db), AUTH_SECRET: 'test-only-secret-with-at-least-32-characters', ACCOUNTS_ENABLED: 'true',
    SEND_VERIFICATION: async (message) => { mail.push(message); } };
  const request = (path, data, token) => new Request(`https://example.test${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Session': token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  async function call(action, data, token, judge = false) {
    const response = await accountApi(request(`/api/accounts/${action}`, data, token), env, judge);
    return { status: response.status, data: await response.json() };
  }
  async function register(username = 'Test Player', email = 'player@example.test') {
    return call('register', { username, email, password: 'a-long-test-password' });
  }
  async function verified(username = 'Test Player', email = 'player@example.test') {
    const signup = await register(username, email);
    assert.equal(signup.status, 201);
    const result = await call('verify', { challengeId: signup.data.challengeId, code: mail.at(-1).code });
    assert.equal(result.status, 200);
    return result.data;
  }
  return { db, env, mail, request, call, register, verified };
}

test('registration requires mailbox verification; next-day login needs only password; secrets never appear in judge output', async (t) => {
  const app = setup();
  try {
    const signup = await app.register();
    assert.equal(signup.status, 201);
    assert.equal(signup.data.token, undefined);
    const row = app.db.prepare('SELECT * FROM accounts').get();
    assert.notEqual(row.password_hash, 'a-long-test-password');
    assert.notEqual(row.code_hash, app.mail[0].code);
    assert.equal(row.verified_at, null);
    const unverified = await app.call('login', { login: 'Test Player', password: 'a-long-test-password' });
    assert.equal(unverified.data.needsVerification, true);
    assert.equal(unverified.data.token, undefined);
    const result = await app.call('verify', { challengeId: signup.data.challengeId, code: app.mail[0].code });
    assert.ok(result.data.token);
    assert.equal(result.data.user.username, 'Test Player');
    assert.equal((await app.call('verify', { challengeId: signup.data.challengeId, code: app.mail[0].code })).status, 400);
    const tomorrow = Date.now() + 86400000;
    t.mock.method(Date, 'now', () => tomorrow);
    const login = await app.call('login', { login: 'PLAYER@example.test', password: 'a-long-test-password' });
    assert.ok(login.data.token);
    assert.equal(app.mail.length, 1);
    const user = await currentAccount(app.request('/api/accounts/me', undefined, login.data.token), app.env);
    assert.equal(user.id, result.data.user.id);
    const judge = await app.call('judge/users', undefined, undefined, true);
    assert.equal(judge.data.users[0].email, 'player@example.test');
    assert.equal(judge.data.users[0].password_hash, undefined);
    assert.equal(judge.data.users[0].code_hash, undefined);
    assert.equal((await app.call('judge/users')).status, 401);
    const session = app.db.prepare('SELECT token_hash FROM account_sessions LIMIT 1').get();
    assert.notEqual(session.token_hash, result.data.token);
    await app.call('logout', {}, login.data.token);
    assert.equal((await app.call('me', undefined, login.data.token)).data.user, null);
  } finally { t.mock.restoreAll(); app.db.close(); }
});

test('concurrent verification requests consume one code once and create only one session', async () => {
  const app = setup();
  try {
    const signup = await app.register();
    const payload = { challengeId: signup.data.challengeId, code: app.mail[0].code };
    const results = await Promise.all([app.call('verify', payload), app.call('verify', payload)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM account_sessions').get().n, 1);
  } finally { app.db.close(); }
});

test('expired codes fail, resend invalidates old challenge, and only five incorrect attempts are allowed', async (t) => {
  const app = setup();
  try {
    const signup = await app.register(); const first = app.mail[0];
    const originalNow = Date.now();
    t.mock.method(Date, 'now', () => originalNow + 11 * 60000);
    assert.equal((await app.call('verify', { challengeId: signup.data.challengeId, code: first.code })).status, 400);
    const resend = await app.call('resend', { challengeId: signup.data.challengeId });
    assert.equal(resend.status, 200);
    assert.notEqual(resend.data.challengeId, signup.data.challengeId);
    assert.equal((await app.call('verify', { challengeId: signup.data.challengeId, code: first.code })).status, 400);
    const code = app.mail.at(-1).code;
    const wrong = code === '000000' ? '000001' : '000000';
    for (let index = 0; index < 5; index++) assert.equal((await app.call('verify', { challengeId: resend.data.challengeId, code: wrong })).status, 400);
    assert.equal((await app.call('verify', { challengeId: resend.data.challengeId, code })).status, 400);
    assert.equal(app.db.prepare('SELECT verified_at FROM accounts').get().verified_at, null);
  } finally { t.mock.restoreAll(); app.db.close(); }
});

test('usernames and emails are unique, invalid passwords fail, login brute force is limited', async () => {
  const app = setup();
  try {
    await app.verified();
    assert.equal((await app.register('test player', 'other@example.test')).status, 400);
    assert.equal((await app.register('Other Name', 'PLAYER@example.test')).status, 400);
    assert.equal((await app.call('register', { username: 'Bad', email: 'bad@example.test', password: 'abc' })).status, 400);
    for (let index = 0; index < 10; index++) assert.equal((await app.call('login', { login: 'Test Player', password: 'wrong-password' })).status, 401);
    assert.equal((await app.call('login', { login: 'Test Player', password: 'a-long-test-password' })).status, 429);
  } finally { app.db.close(); }
});

test('server overwrites forged names and rejects anonymous or foreign sessions in all game modes', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    for (const path of ['/api/solving/start', '/api/solving/answer', '/api/sprint/start', '/api/tournaments/start']) {
      await assert.rejects(authorizeGameRequest(app.request(path, { name: 'Somebody Else' }), app.env), { status: 401 });
      const result = await authorizeGameRequest(app.request(path, { name: 'Somebody Else' }, login.token), app.env);
      assert.equal((await result.request.json()).name, 'Test Player');
    }
    for (const path of ['/api/solving/series?name=Else', '/api/sprint/session?name=Else', '/api/sprint/round?sessionId=foreign']) {
      await assert.rejects(authorizeGameRequest(app.request(path), app.env), { status: 401 });
    }
    for (const path of ['/api/sprint/submit', '/api/tournaments/submit']) {
      await assert.rejects(authorizeGameRequest(app.request(path, { sessionId: 'foreign' }, login.token), app.env), { status: 403 });
    }
    await assert.rejects(authorizeGameRequest(app.request('/api/sprint/round?sessionId=foreign', undefined, login.token), app.env), { status: 403 });
    const calendar = await authorizeGameRequest(app.request('/api/sprint/calendar?name=Other', undefined, login.token), app.env);
    assert.equal(new URL(calendar.request.url).searchParams.get('name'), 'Test Player');
    assert.equal(normalizePlayer('test player', app.db).id, login.user.playerId);
    assert.notEqual(normalizePlayer('test player').id, login.user.playerId, 'Legacy results are not automatically claimed');
  } finally { app.db.close(); }
});

test('activity and login timestamps are visible only through judge history and idle refreshes do not write to D1', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    const user = await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env);
    await recordAccountActivity(app.env, user, 'solving', 'start');
    const before = app.db.prepare('SELECT total_changes() AS n').get().n;
    await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env);
    assert.equal(app.db.prepare('SELECT total_changes() AS n').get().n, before);
    const history = await app.call(`judge/history?id=${user.id}`, undefined, undefined, true);
    assert.equal(history.data.sessions.length, 1);
    assert.equal(history.data.activity[0].action, 'start');
    assert.equal((await app.call(`judge/history?id=${user.id}`)).status, 401);
    app.db.prepare('UPDATE account_sessions SET expires_at=0').run();
    assert.equal(await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env), null);
  } finally { app.db.close(); }
});

test('four-character passwords support verified registration and subsequent login', async () => {
  const app = setup();
  try {
    const signup = await app.call('register', { username: 'Four Characters', email: 'four@example.test', password: 'a4!B' });
    assert.equal(signup.status, 201);
    const verification = await app.call('verify', { challengeId: signup.data.challengeId, code: app.mail[0].code });
    assert.ok(verification.data.token);
    const login = await app.call('login', { login: 'Four Characters', password: 'a4!B' });
    assert.equal(login.status, 200);
    assert.ok(login.data.token);
    assert.equal((await app.call('register', { username: 'Too Short', email: 'short@example.test', password: 'abc' })).status, 400);
  } finally { app.db.close(); }
});

test('mail configuration fails closed and a mail delivery error never verifies an account', async () => {
  const app = setup();
  try {
    delete app.env.SEND_VERIFICATION;
    assert.equal((await app.register()).status, 503);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM accounts').get().n, 0);
    app.env.SEND_VERIFICATION = () => { throw new Error('provider unavailable'); };
    assert.equal((await app.register()).status, 503);
    const row = app.db.prepare('SELECT * FROM accounts').get();
    assert.equal(row.verified_at, null); assert.equal(row.code_hash, null);
    const login = await app.call('login', { login: 'Test Player', password: 'a-long-test-password' });
    assert.equal(login.data.needsVerification, true);
    app.env.SEND_VERIFICATION = async (message) => app.mail.push(message);
    const resend = await app.call('resend', { challengeId: login.data.challengeId });
    assert.equal(resend.status, 200);
    assert.equal((await app.call('verify', { challengeId: resend.data.challengeId, code: app.mail.at(-1).code })).status, 200);
  } finally { app.db.close(); }
});
