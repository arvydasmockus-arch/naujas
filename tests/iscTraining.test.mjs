import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.mjs';
import { d1Adapter } from '../server/d1Adapter.mjs';
import { TournamentStore } from '../server/tournamentStore.mjs';
import { parseTournamentEntry } from '../server/tournamentTools.mjs';
import { accountApi } from '../server/accountAuth.mjs';
import { tournamentPdf } from '../server/tournamentPdf.mjs';
import { guardIsc, iscApi, iscStart, runIscSchedule, deliverIscMail, frozenIscPdf } from '../server/iscTraining.mjs';

function setup(t) {
  let now = Date.parse('2026-11-02T09:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const db = openDatabase(':memory:', false); const store = new TournamentStore(db, () => now);
  const env = { DB: d1Adapter(db), ACCOUNTS_ENABLED: 'true', AUTH_SECRET: 'test-only-secret-with-at-least-32-characters',
    BREVO_API_KEY: 'test-only', EMAIL_FROM: 'sender@example.test', SEND_VERIFICATION: async () => {} };
  const deliveries = []; const pdfKinds = [];
  env.SEND_ISC_EMAIL = async (message) => deliveries.push(message);
  const dependencies = {
    generate(id) { const event = store.get(id, true); return store.generate({ targetId: id, mode: 'competition', date: event.date }); },
    event: (id) => store.get(id, true), pdf: async (event, kind) => { pdfKinds.push(kind); return Buffer.from(`%PDF-${event.id}-${kind}`); },
  };
  for (const entry of JSON.parse(readFileSync(new URL('./fixtures/tournamentEntries.json', import.meta.url), 'utf8'))) {
    const puzzle = parseTournamentEntry(entry, '2026-10-09T00:00:00Z');
    db.prepare('INSERT INTO tournament_pool VALUES(?,?,?,?,?,?)').run(puzzle.id, puzzle.type, JSON.stringify(entry), JSON.stringify(puzzle), puzzle.positionHash, puzzle.usageCheckedAt);
  }
  const request = (path, data, token) => new Request(`https://test.example${path}`, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Session': token } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  async function call(action, data, judge = true, token, id) {
    const response = await iscApi(request(`/api/tournaments/isc/${action}${id ? `?id=${id}` : ''}`, data, token), env, judge, dependencies);
    return { status: response.status, ...await response.json() };
  }
  async function user(name = 'Alice', email = 'alice@example.test') {
    await accountApi(request('/api/accounts/register', { username: name, email, password: '1234' }), env);
    db.prepare('UPDATE accounts SET verified_at=? WHERE email=?').run(now, email);
    const response = await accountApi(request('/api/accounts/login', { login: email, password: '1234' }), env);
    return response.json();
  }
  async function event(ready = false) {
    const created = await call('create', { title: 'ISC test', date: '2026-11-08' }); assert.equal(created.status, 200);
    if (ready) {
      assert.equal((await call('generate', { id: created.id })).status, 200);
      assert.equal((await call('announce', { id: created.id, announced: true })).status, 200);
      await call('prepare', { id: created.id, kind: 'problems' }); await call('prepare', { id: created.id, kind: 'solutions' });
      assert.equal((await call('arm', { id: created.id, reviewed: true })).status, 200);
    }
    return created.id;
  }
  t.after(() => db.close());
  return { db, store, env, dependencies, deliveries, pdfKinds, call, user, event, setTime: (time) => { now = typeof time === 'string' ? Date.parse(time) : time; }, schedule: () => runIscSchedule(env, dependencies, now) };
}

test('ISC Sunday 11:00 uses CET/CEST including both DST changes', () => {
  for (const [date, utc] of [['2026-11-08', '10:00'], ['2027-07-04', '09:00'], ['2027-03-28', '09:00'], ['2027-10-31', '10:00']]) {
    assert.equal(new Date(iscStart(date)).toISOString(), `${date}T${utc}:00.000Z`);
  }
  for (const date of ['2026-11-09', '2026-02-30', 'wrong', null]) assert.throws(() => iscStart(date), /Sunday/);
});

test('ISC announcements and names are public, drafts and account emails stay private; registrations require verified accounts and close at start', async (t) => {
  const app = setup(t); const id = await app.event();
  assert.equal((await app.call('create', { date: '2026-11-08' }, false)).status, 401);
  assert.equal(app.store.list().tournaments.length, 0);
  assert.equal((await app.call('details', undefined, false, '', id)).status, 404);
  await app.call('generate', { id }); await app.call('announce', { id, announced: true });
  assert.equal(app.store.list().tournaments.length, 1);
  assert.equal(app.store.get(id).puzzles.length, 0);
  assert.equal((await app.call('register', { id }, false)).status, 401);
  const alice = await app.user();
  assert.equal((await app.call('register', { id, accountId: 'forged' }, false, alice.token)).status, 200);
  await app.call('register', { id }, false, alice.token);
  const details = await app.call('details', undefined, false, alice.token, id);
  assert.equal(details.registered, true); assert.equal(details.participants.length, 1);
  assert.equal(details.participants[0].username, 'Alice');
  assert.ok(!JSON.stringify(details).includes('example.test'));
  assert.equal(details.jobs, undefined); assert.equal(details.mail, undefined);
  await app.call('unregister', { id }, false, alice.token);
  assert.equal((await app.call('details', undefined, false, alice.token, id)).participants.length, 0);
  await app.call('register', { id }, false, alice.token);
  app.setTime('2026-11-08T10:00:00Z');
  assert.equal((await app.call('unregister', { id }, false, alice.token)).status, 400);
  assert.equal((await app.call('register', { id }, false, alice.token)).status, 400);
  assert.equal(app.store.get(id).puzzles.length, 0, 'unreviewed set never opens');
});

test('ISC common deadline and three-hour solution gate hold even if cron is late and legacy publication flags are set', async (t) => {
  const app = setup(t); const id = await app.event(true); const alice = await app.user(); const bob = await app.user('Bob', 'bob@example.test');
  await app.call('register', { id }, false, alice.token);
  await assert.rejects(guardIsc(app.env.DB, id, 'start', alice.user.id), /not started/);
  await assert.rejects(guardIsc(app.env.DB, id, 'settings'), /Disarm/);
  app.db.prepare('UPDATE tournaments SET solutions_public=1,results_public=1 WHERE id=?').run(id);
  assert.equal(app.store.get(id).solutionsPublic, false);
  app.setTime('2026-11-08T10:45:00Z');
  const state = await guardIsc(app.env.DB, id, 'start', alice.user.id);
  assert.equal(state.endsAt, Date.parse('2026-11-08T12:00:00Z'));
  const session = app.store.start(id, 'Alice', state.endsAt);
  assert.equal(session.deadline, state.endsAt);
  await assert.rejects(guardIsc(app.env.DB, id, 'start', bob.user.id), /Register/);
  const publicEvent = app.store.get(id);
  assert.equal(publicEvent.puzzles.length, 6); assert.equal(publicEvent.puzzles[0].solution, undefined);
  assert.equal(publicEvent.solutionsPublic, false); assert.equal(publicEvent.resultsPublic, false);
  app.setTime('2026-11-08T12:00:01Z');
  await assert.rejects(guardIsc(app.env.DB, id, 'submit', alice.user.id), /ended/);
  assert.equal(app.store.get(id).solutionsPublic, false);
  app.setTime('2026-11-08T13:00:00Z');
  assert.equal(app.store.get(id).solutionsPublic, true); assert.ok(app.store.get(id).puzzles[0].solution);
});

test('scheduled generation creates a judge draft once; approval is explicit and disarming cancels release jobs', async (t) => {
  const app = setup(t);
  const generation = Date.parse('2026-11-03T09:00:00Z');
  const { id } = await app.call('create', { title: 'Limontas Open', date: '2026-11-08', generateAt: generation });
  assert.equal(app.store.get(id, true).displayTitle, 'Limontas Open — 08.11.2026');
  assert.equal(app.store.get(id, true).number, null);
  await app.schedule(); assert.equal(app.store.get(id, true).puzzles.length, 0);
  app.setTime(generation); await app.schedule(); await app.schedule();
  assert.equal(app.store.get(id, true).puzzles.length, 6);
  assert.equal(app.store.list().tournaments.length, 0);
  assert.equal((await app.call('arm', { id, reviewed: true })).status, 400, 'announcement required');
  await app.call('announce', { id, announced: true });
  assert.equal((await app.call('arm', { id })).status, 400, 'review required');
  await app.call('prepare', { id, kind: 'problems' }); await app.call('prepare', { id, kind: 'solutions' });
  await app.call('arm', { id, reviewed: true }); await app.call('disarm', { id });
  assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM isc_jobs WHERE kind!='generate'").get().n, 0);
  assert.equal(app.store.get(id, true).isc.armed, false);
  assert.equal(app.deliveries.length, 0);
});

test('ISC outbox sends separate PDF attachments at start and +3 hours, caches PDFs, and survives repeated and concurrent ticks', async (t) => {
  const app = setup(t); const id = await app.event(true); const alice = await app.user(); const bob = await app.user('Bob', 'bob@example.test');
  for (const user of [alice, bob]) await app.call('register', { id }, false, user.token);
  await app.schedule(); assert.equal(app.deliveries.length, 0);
  app.setTime('2026-11-08T10:00:00Z');
  await Promise.all([app.schedule(), app.schedule()]); await app.schedule();
  assert.equal(app.deliveries.length, 2); assert.deepEqual(app.pdfKinds, ['problems', 'solutions'], 'PDFs are prepared before the start; cron never rebuilds them');
  assert.equal(app.deliveries[0].to.length, 1); assert.equal(app.deliveries[0].cc, undefined);
  for (const mail of app.deliveries) { assert.equal(Buffer.from(mail.attachment[0].content, 'base64').toString().startsWith('%PDF-'), true); assert.match(mail.headers.idempotencyKey, /^[a-f0-9-]{36}$/); }
  app.setTime('2026-11-08T12:59:59Z'); await app.schedule(); assert.equal(app.deliveries.length, 2);
  app.setTime('2026-11-08T13:00:00Z'); await app.schedule(); await app.schedule();
  assert.equal(app.deliveries.length, 4); assert.deepEqual(app.pdfKinds, ['problems', 'solutions']);
});

test('temporary mail failures retry with the same idempotency key and judges see errors, but successful recipients are never resent', async (t) => {
  const app = setup(t); const id = await app.event(true); const alice = await app.user();
  await app.call('register', { id }, false, alice.token);
  const keys = []; let fail = true;
  app.env.SEND_ISC_EMAIL = async (body) => { keys.push(body.headers.idempotencyKey); if (fail) throw new Error('Test provider unavailable'); app.deliveries.push(body); };
  app.setTime('2026-11-08T10:00:00Z'); await app.schedule();
  const details = await app.call('details', undefined, true, '', id);
  assert.match(details.mail[0].error, /Test provider/); assert.equal(app.deliveries.length, 0);
  fail = false; app.setTime('2026-11-08T10:02:00Z'); await app.schedule(); await app.schedule();
  assert.equal(app.deliveries.length, 1); assert.equal(keys[0], keys[1]);
  assert.equal(app.db.prepare('SELECT status FROM isc_mail').get().status, 'sent');
});

test('deleting an account removes its ISC registration and pending mail without damaging the tournament', async (t) => {
  const app = setup(t); const id = await app.event(true); const alice = await app.user();
  await app.call('register', { id }, false, alice.token);
  app.env.SEND_ISC_EMAIL = async () => { throw new Error('not sent'); };
  app.setTime('2026-11-08T10:00:00Z'); await app.schedule();
  app.db.prepare('DELETE FROM account_sessions WHERE account_id=?').run(alice.user.id);
  app.db.prepare('DELETE FROM accounts WHERE id=?').run(alice.user.id);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM isc_registrations').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM isc_mail').get().n, 0);
  assert.equal(app.store.get(id).puzzles.length, 6);
});

test('idle ISC tick only checks indexed due work and never scans problem pools or runs daily generation', async () => {
  const queries = [];
  await runIscSchedule({ DB: { prepare(sql) { queries.push(sql); return { bind() { return this; }, all() { return { results: [] }; } }; } } }, {});
  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => /isc_(jobs|mail)/.test(sql) && /status='pending'/.test(sql) && /run_at<=/.test(sql)));
});

test('editing invalidates prepared PDFs and approval requires both PDFs from the same revision', async (t) => {
  const app = setup(t); const id = await app.event();
  await app.call('generate', { id }); await app.call('announce', { id, announced: true });
  await app.call('prepare', { id, kind: 'problems' }); await app.call('prepare', { id, kind: 'solutions' });
  app.store.settings(id, { title: 'Corrected ISC title', solutionDrafts: Array(6).fill('1.Ke4 [5]') });
  await assert.rejects(frozenIscPdf(app.env.DB, id, 'problems'), /Prepare/);
  assert.equal((await app.call('arm', { id, reviewed: true })).status, 400);
  await app.call('prepare', { id, kind: 'problems' });
  assert.equal((await app.call('arm', { id, reviewed: true })).status, 400);
  await app.call('prepare', { id, kind: 'solutions' });
  assert.equal((await app.call('arm', { id, reviewed: true })).status, 200);
  assert.equal((await frozenIscPdf(app.env.DB, id, 'problems')).event.title, 'Corrected ISC title');
});

test('judge can regenerate armed PDFs in the selected language until the scheduled start', async (t) => {
  const app = setup(t); const id = await app.event(true); const generated = [];
  app.dependencies.pdf = async (_event, kind, language) => {
    generated.push([kind, language]); return Buffer.from(`%PDF-${language}-${kind}`);
  };
  for (const kind of ['problems', 'solutions']) assert.equal((await app.call('prepare', { id, kind, language: 'en' })).status, 200);
  assert.deepEqual(generated, [['problems', 'en'], ['solutions', 'en']]);
  assert.equal(Buffer.from((await frozenIscPdf(app.env.DB, id, 'problems')).pdf, 'base64').toString(), '%PDF-en-problems');
  app.setTime('2026-11-08T10:00:00Z');
  assert.equal((await app.call('prepare', { id, kind: 'problems', language: 'lt' })).status, 400);
});

test('ISC queue sends one stored PDF per recipient, ignores duplicate/stale messages, and never regenerates PDFs', async (t) => {
  const app = setup(t); const id = await app.event(true); const alice = await app.user();
  await app.call('register', { id }, false, alice.token);
  const queued = []; app.env.ISC_MAIL_QUEUE = { sendBatch: async (messages) => queued.push(...messages) };
  app.setTime('2026-11-08T10:00:00Z'); await app.schedule();
  assert.equal(app.deliveries.length, 0); assert.equal(queued.length, 1);
  const message = queued[0].body;
  await Promise.all([deliverIscMail(app.env, message.id, message.lease), deliverIscMail(app.env, message.id, message.lease)]);
  await deliverIscMail(app.env, message.id, message.lease);
  assert.equal(app.deliveries.length, 1); assert.deepEqual(app.pdfKinds, ['problems', 'solutions']);
  assert.equal(app.deliveries[0].attachment[0].content, (await frozenIscPdf(app.env.DB, id, 'problems')).pdf);
  assert.equal(app.db.prepare('SELECT status FROM isc_mail').get().status, 'sent');
});

test('queue failures retry through the indexed outbox; expired uncertain deliveries stop for judge review', async (t) => {
  const app = setup(t); const id = await app.event(true); const alice = await app.user();
  await app.call('register', { id }, false, alice.token);
  const queued = []; app.env.ISC_MAIL_QUEUE = { sendBatch: async (messages) => queued.push(...messages) };
  app.env.SEND_ISC_EMAIL = async () => { throw new Error('Test provider unavailable'); };
  app.setTime('2026-11-08T10:00:00Z'); await app.schedule();
  const first = queued[0].body; await deliverIscMail(app.env, first.id, first.lease);
  app.setTime('2026-11-08T10:02:00Z'); await app.schedule();
  assert.equal(queued.length, 2); const second = queued[1].body;
  assert.equal(second.id, first.id); assert.notEqual(second.lease, first.lease);
  await deliverIscMail(app.env, first.id, first.lease); // stale packet cannot reclaim the delivery
  app.setTime('2026-11-08T10:26:00Z'); await deliverIscMail(app.env, second.id, second.lease);
  const mail = app.db.prepare('SELECT * FROM isc_mail').get();
  assert.equal(mail.status, 'failed'); assert.match(mail.last_error, /review/);
});

test('ISC approval stores real problem and solution PDFs and email attachments use those exact bytes', async (t) => {
  const app = setup(t); app.dependencies.pdf = tournamentPdf;
  const id = await app.event(true); const alice = await app.user();
  await app.call('register', { id }, false, alice.token);
  for (const kind of ['problems', 'solutions']) {
    const { pdf } = await frozenIscPdf(app.env.DB, id, kind);
    const bytes = Buffer.from(pdf, 'base64');
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length < 1500000);
  }
  app.setTime('2026-11-08T10:00:00Z'); await app.schedule();
  assert.equal(app.deliveries[0].attachment[0].content, (await frozenIscPdf(app.env.DB, id, 'problems')).pdf);
});
