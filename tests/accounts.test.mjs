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

test('judge can rename an account without losing identity, verification, sessions or results', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    const user = login.user;
    app.db.prepare('INSERT INTO sprint_days(date,created_at) VALUES(?,?)').run('2026-10-01', 1);
    app.db.prepare('INSERT INTO sprint_sessions(id,date,player_id,name,started_at,submitted_at,points) VALUES(?,?,?,?,?,?,?)')
      .run('rename-result', '2026-10-01', user.playerId, user.username, 1, 2, 3);
    app.db.prepare('INSERT INTO tournaments(id,title,date,mode,status,created_at) VALUES(?,?,?,?,?,?)').run('event', 'Event', '2026-10-01', 'training', 'published', 1);
    app.db.prepare('INSERT INTO tournament_sessions(id,tournament_id,player_id,name,started_at) VALUES(?,?,?,?,?)')
      .run('rename-tournament', 'event', user.playerId, user.username, 1);
    app.db.prepare('INSERT INTO forum_topics(id,title,author_id,author_name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('rename-topic', 'Topic', user.id, user.username, 1, 1);
    app.db.prepare('INSERT INTO forum_posts(topic_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?)').run('rename-topic', user.id, user.username, 'Hello', 1);
    const before = app.db.prepare('SELECT * FROM accounts WHERE id=?').get(user.id);
    const payload = { id: user.id, username: user.username, email: user.email, newUsername: '  New   Player  ', newEmail: user.email, confirmed: true };
    const result = await app.call('judge/edit', payload, undefined, true);
    assert.equal(result.status, 200); assert.equal(result.data.emailChanged, false);
    const after = app.db.prepare('SELECT * FROM accounts WHERE id=?').get(user.id);
    assert.equal(after.username, 'New Player'); assert.equal(after.username_key, 'new player');
    assert.equal(after.verified_at, before.verified_at); assert.equal(after.password_hash, before.password_hash);
    assert.equal((await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env)).username, 'New Player');
    assert.equal(normalizePlayer('New Player', app.db).id, user.playerId);
    assert.equal(app.db.prepare('SELECT name FROM players WHERE id=?').get(user.playerId).name, 'New Player');
    const score = app.db.prepare('SELECT * FROM sprint_sessions WHERE id=?').get('rename-result');
    assert.equal(score.name, 'New Player'); assert.equal(score.points, 3); assert.equal(score.player_id, user.playerId);
    assert.equal(app.db.prepare('SELECT name FROM tournament_sessions WHERE id=?').get('rename-tournament').name, 'New Player');
    assert.equal(app.db.prepare('SELECT author_name FROM forum_posts WHERE topic_id=?').get('rename-topic').author_name, 'New Player');
    assert.equal((await app.call('login', { login: user.username, password: 'a-long-test-password' })).status, 401);
    assert.equal((await app.call('login', { login: 'New Player', password: 'a-long-test-password' })).status, 200);
  } finally { app.db.close(); }
});

test('changing email invalidates verification, old codes and sessions while preserving password and account ID', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    const before = app.db.prepare('SELECT * FROM accounts').get();
    const payload = { id: before.id, username: before.username, email: before.email, newUsername: before.username, newEmail: '  Correct@Example.Test ', confirmed: true };
    assert.equal((await app.call('judge/edit', payload, undefined, true)).status, 200);
    const after = app.db.prepare('SELECT * FROM accounts').get();
    assert.equal(after.id, before.id); assert.equal(after.email, 'correct@example.test');
    assert.equal(after.verified_at, null); assert.equal(after.verification_method, null);
    assert.equal(after.password_hash, before.password_hash); assert.equal(after.salt, before.salt);
    assert.equal(after.code_hash, null); assert.notEqual(after.challenge_id, before.challenge_id);
    assert.equal(await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env), null);
    assert.ok(app.db.prepare('SELECT logout_at FROM account_sessions WHERE account_id=?').get(before.id).logout_at);
    assert.equal(app.mail.length, 1, 'Saving an email never sends email automatically');
    const pending = await app.call('login', { login: before.username, password: 'a-long-test-password' });
    assert.equal(pending.data.needsVerification, true); assert.equal(pending.data.token, undefined);
    const resent = await app.call('resend', { challengeId: pending.data.challengeId });
    assert.equal(resent.status, 200); assert.equal(app.mail.at(-1).email, 'correct@example.test');
    const verified = await app.call('verify', { challengeId: resent.data.challengeId, code: app.mail.at(-1).code });
    assert.equal(verified.status, 200); assert.equal(verified.data.user.id, before.id);
    assert.equal(await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env), null, 'Re-verification must not revive the old session');
  } finally { app.db.close(); }
});

test('judge editing enforces authorization, uniqueness, validation and stale-row protection atomically', async () => {
  const app = setup();
  try {
    const first = await app.verified('First', 'first@example.test');
    await app.verified('Second', 'second@example.test');
    const payload = { id: first.user.id, username: 'First', email: 'first@example.test', newUsername: 'Changed', newEmail: 'first@example.test', confirmed: true };
    assert.equal((await app.call('judge/edit', payload, first.token)).status, 401);
    assert.equal((await app.call('judge/edit', { ...payload, confirmed: false }, undefined, true)).status, 400);
    assert.equal((await app.call('judge/edit', { ...payload, username: 'Stale' }, undefined, true)).status, 409);
    assert.equal((await app.call('judge/edit', { ...payload, newUsername: 'SECOND' }, undefined, true)).status, 409);
    assert.equal((await app.call('judge/edit', { ...payload, newEmail: 'second@example.test' }, undefined, true)).status, 409);
    assert.equal((await app.call('judge/edit', { ...payload, newEmail: 'invalid' }, undefined, true)).status, 400);
    assert.equal((await app.call('judge/edit', { ...payload, newUsername: '@invalid' }, undefined, true)).status, 400);
    assert.equal(app.db.prepare('SELECT username FROM accounts WHERE id=?').get(first.user.id).username, 'First');
    assert.ok(await currentAccount(app.request('/api/accounts/me', undefined, first.token), app.env));
    const batch = app.env.DB.batch;
    app.env.DB.batch = async statements => {
      app.db.prepare('UPDATE accounts SET username=?,username_key=? WHERE id=?').run('Concurrent', 'concurrent', first.user.id);
      app.db.prepare('UPDATE players SET name=? WHERE id=?').run('Concurrent', first.user.playerId);
      return batch(statements);
    };
    assert.equal((await app.call('judge/edit', payload, undefined, true)).status, 409);
    assert.equal(app.db.prepare('SELECT name FROM players WHERE id=?').get(first.user.playerId).name, 'Concurrent');
  } finally { app.db.close(); }
});

test('an email change during login cannot create a new session from stale account details', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    const batch = app.env.DB.batch;
    app.env.DB.batch = async statements => {
      app.db.prepare('UPDATE accounts SET email=?,verified_at=NULL WHERE id=?').run('changed@example.test', login.user.id);
      app.db.prepare('UPDATE account_sessions SET logout_at=? WHERE account_id=?').run(Date.now(), login.user.id);
      return batch(statements);
    };
    const result = await app.call('login', { login: login.user.username, password: 'a-long-test-password' });
    assert.equal(result.status, 409);
    assert.equal(result.data.token, undefined);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n, 1);
  } finally { app.db.close(); }
});

test('resending a code cannot approve a new address with a code sent to the old mailbox', async () => {
  const app = setup();
  try {
    const signup = await app.register();
    app.db.prepare('UPDATE accounts SET code_sent_at=0').run();
    const prepare = app.env.DB.prepare;
    app.env.DB.prepare = sql => {
      const statement = prepare(sql);
      if (sql.startsWith('UPDATE accounts SET code_hash=')) {
        const run = statement.run;
        statement.run = () => {
          app.db.prepare("UPDATE accounts SET email='changed@example.test',challenge_id='changed-challenge',code_hash=NULL").run();
          return run();
        };
      }
      return statement;
    };
    assert.notEqual((await app.call('resend', { challengeId: signup.data.challengeId })).status, 200);
    assert.equal(app.mail.length, 1);
    const row = app.db.prepare('SELECT email,challenge_id,code_hash FROM accounts').get();
    assert.equal(row.email, 'changed@example.test'); assert.equal(row.challenge_id, 'changed-challenge'); assert.equal(row.code_hash, null);
  } finally { app.db.close(); }
});

test('pending email edits revoke the old working code and can be approved manually', async () => {
  const app = setup();
  try {
    const signup = await app.register();
    const code = app.mail.at(-1).code;
    const before = app.db.prepare('SELECT id,username,email FROM accounts').get();
    assert.equal((await app.call('judge/edit', { ...before, newUsername: before.username, newEmail: 'new@example.test', confirmed: true }, undefined, true)).status, 200);
    assert.equal((await app.call('verify', { challengeId: signup.data.challengeId, code })).status, 400);
    assert.equal((await app.call('judge/verify', { ...before, email: 'new@example.test', confirmed: true }, undefined, true)).status, 200);
    assert.equal((await app.call('login', { login: 'new@example.test', password: 'a-long-test-password' })).status, 200);
  } finally { app.db.close(); }
});

test('only the judge can manually verify the exact pending account; old codes expire and password login works', async () => {
  const app = setup();
  try {
    const signup = await app.register();
    const pending = app.db.prepare('SELECT * FROM accounts').get();
    const code = app.mail.at(-1).code;
    const payload = { id: pending.id, username: pending.username, email: pending.email, confirmed: true };
    assert.equal((await app.call('judge/verify', payload)).status, 401);
    assert.equal((await app.call('judge/verify', { ...payload, confirmed: false }, undefined, true)).status, 400);
    assert.equal((await app.call('judge/verify', { ...payload, email: 'stale@example.test' }, undefined, true)).status, 409);
    assert.equal((await app.call('judge/verify', undefined, undefined, true)).status, 404);
    assert.equal(app.db.prepare('SELECT verified_at FROM accounts').get().verified_at, null);
    assert.equal((await app.call('judge/verify', payload, undefined, true)).status, 200);
    const verified = app.db.prepare('SELECT * FROM accounts').get();
    assert.ok(verified.verified_at);
    assert.equal(verified.verification_method, 'judge');
    assert.equal(verified.code_hash, null); assert.equal(verified.code_expires_at, null); assert.equal(verified.challenge_id, null);
    assert.equal(verified.password_hash, pending.password_hash); assert.equal(verified.salt, pending.salt);
    assert.equal(app.mail.length, 1, 'Manual approval does not send another email');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n, 0, 'Approval does not sign anyone in');
    assert.equal((await app.call('verify', { challengeId: signup.data.challengeId, code })).status, 400);
    const login = await app.call('login', { login: pending.username, password: 'a-long-test-password' });
    assert.equal(login.status, 200); assert.ok(login.data.token); assert.equal(login.data.user.id, pending.id);
    assert.equal((await app.call('judge/verify', payload, undefined, true)).status, 200);
    assert.equal(app.db.prepare('SELECT verified_at FROM accounts').get().verified_at, verified.verified_at);
    const listing = await app.call('judge/users', undefined, undefined, true);
    assert.equal(listing.data.users[0].verification_method, 'judge');
  } finally { app.db.close(); }
});

test('manual verification never changes an account already verified by email', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    const before = app.db.prepare('SELECT * FROM accounts').get();
    assert.equal(before.verification_method, 'email');
    assert.equal((await app.call('judge/verify', { id: login.user.id, username: before.username, email: before.email, confirmed: true }, undefined, true)).status, 200);
    const after = app.db.prepare('SELECT * FROM accounts').get();
    assert.equal(after.verification_method, 'email'); assert.equal(after.verified_at, before.verified_at);
  } finally { app.db.close(); }
});

test('only the judge can delete accounts; confirmation is required and existing results survive', async () => {
  const app = setup();
  try {
    const login = await app.verified();
    const user = await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env);
    await recordAccountActivity(app.env, user, 'sprint', 'start');
    app.db.prepare('INSERT INTO sprint_days(date,created_at) VALUES(?,?)').run('2026-10-01', 1);
    app.db.prepare('INSERT INTO sprint_sessions(id,date,player_id,name,started_at,submitted_at,points) VALUES(?,?,?,?,?,?,?)')
      .run('retained-result', '2026-10-01', user.playerId, user.username, 1, 2, 3);
    const payload = { id: user.id, username: user.username, email: user.email, confirmed: true };
    assert.equal((await app.call('judge/delete', payload, login.token)).status, 401);
    assert.equal((await app.call('judge/delete', { ...payload, confirmed: false }, undefined, true)).status, 400);
    assert.equal((await app.call('judge/delete', { ...payload, email: 'stale@example.test' }, undefined, true)).status, 409);
    assert.equal((await app.call('judge/delete', undefined, undefined, true)).status, 404);
    assert.equal((await app.call('judge/delete', payload, undefined, true)).status, 200);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM account_activity').get().n, 0);
    assert.equal(await currentAccount(app.request('/api/accounts/me', undefined, login.token), app.env), null);
    assert.equal(app.db.prepare('SELECT points FROM sprint_sessions WHERE id=?').get('retained-result').points, 3);
    const replacement = await app.verified('Test Player', 'correct@example.test');
    assert.notEqual(replacement.user.playerId, user.playerId, 'A new registration must not inherit old results');
    assert.equal((await app.call('judge/delete', payload, undefined, true)).status, 404);
  } finally { app.db.close(); }
});

test('deleting an unverified registration frees its email and username and invalidates its code', async () => {
  const app = setup();
  try {
    const signup = await app.register();
    const user = app.db.prepare('SELECT id,username,email FROM accounts').get();
    const code = app.mail.at(-1).code;
    assert.equal((await app.call('judge/delete', { ...user, confirmed: true }, undefined, true)).status, 200);
    assert.equal((await app.call('verify', { challengeId: signup.data.challengeId, code })).status, 400);
    assert.equal((await app.register()).status, 201);
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
