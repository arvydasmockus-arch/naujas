import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.mjs';
import { d1Adapter } from '../server/d1Adapter.mjs';
import { accountApi } from '../server/accountAuth.mjs';
import { forumApi } from '../server/forumApi.mjs';

async function setup() {
  const db = openDatabase(':memory:', false);
  const mail = [];
  const env = { DB: d1Adapter(db), AUTH_SECRET: 'forum-test-secret-at-least-32-characters', ACCOUNTS_ENABLED: 'true', SEND_VERIFICATION: async message => mail.push(message) };
  function request(path, data, token) {
    return new Request(`https://example.test/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Session': token } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  async function call(action, data, token, judge = false) {
    const response = await forumApi(request('forum/' + action, data, token), env, judge);
    return { status: response.status, data: await response.json() };
  }
  async function register(username) {
    const result = await (await accountApi(request('accounts/register', { username, email: `${username}@example.test`, password: 'test-password' }), env)).json();
    return (await accountApi(request('accounts/verify', { challengeId: result.challengeId, code: mail.at(-1).code }), env)).json();
  }
  const alice = await register('Alice');
  const bob = await register('Bob');
  return { db, env, request, call, alice, bob };
}

test('forum is public to read; verified accounts write with server-side names and never expose email', async () => {
  const app = await setup();
  try {
    assert.deepEqual((await app.call('topics')).data.topics, []);
    assert.equal((await app.call('topics', { title: 'Chess', body: 'Hello' })).status, 401);
    const created = await app.call('topics', { title: 'Chess', body: 'Hello <script>alert(1)</script>', authorName: 'Forged', authorId: app.bob.user.id }, app.alice.token);
    assert.equal(created.status, 201);
    const detail = await app.call('topic?id=' + created.data.id);
    assert.equal(detail.data.posts[0].authorName, 'Alice');
    assert.equal(detail.data.posts[0].authorId, app.alice.user.id);
    assert.ok(!JSON.stringify(detail.data).includes('@example.test'));
    const answer = await app.call('reply', { topicId: created.data.id, body: 'Answer' }, app.bob.token);
    assert.equal(answer.status, 201);
    assert.ok(Number.isSafeInteger(answer.data.id));
    assert.equal((await app.call('topic?id=' + created.data.id)).data.topic.postCount, 2);
    const postId = detail.data.posts[0].id;
    assert.equal((await app.call('edit', { id: postId, body: 'Stolen' }, app.bob.token)).status, 403);
    assert.equal((await app.call('edit', { id: postId, body: 'Changed' }, app.alice.token)).status, 200);
    assert.equal((await app.call('delete-post', { id: postId, confirmed: true }, app.bob.token)).status, 403);
    assert.equal((await app.call('delete-post', { id: postId }, app.alice.token)).status, 400);
    assert.equal((await app.call('delete-post', { id: postId, confirmed: true }, app.alice.token)).status, 200);
    const removed = (await app.call('topic?id=' + created.data.id)).data.posts[0];
    assert.equal(removed.body, ''); assert.ok(removed.deletedAt);
    assert.equal((await app.call('edit', { id: postId, body: 'Restore' }, app.alice.token)).status, 404);
  } finally { app.db.close(); }
});

test('forum rejects invalid text and repeated posting and requires judge confirmation for full topic deletion', async () => {
  const app = await setup();
  try {
    assert.equal((await app.call('topics', { title: ' ', body: 'Hello' }, app.alice.token)).status, 400);
    assert.equal((await app.call('topics', { title: 'Chess', body: 'x'.repeat(10001) }, app.alice.token)).status, 400);
    const created = await app.call('topics', { title: 'Chess', body: 'Hello' }, app.alice.token);
    for (let i = 0; i < 4; i++) assert.equal((await app.call('topics', { title: 'More', body: 'Hello' }, app.alice.token)).status, 201);
    assert.equal((await app.call('topics', { title: 'Too many', body: 'Hello' }, app.alice.token)).status, 429);
    assert.equal((await app.call('reply', { topicId: 'missing', body: 'Hello' }, app.alice.token)).status, 404);
    assert.equal((await app.call('delete-topic', { topicId: created.data.id, confirmed: true }, app.alice.token)).status, 403);
    assert.equal((await app.call('delete-topic', { topicId: created.data.id }, undefined, true)).status, 400);
    assert.equal((await app.call('delete-topic', { topicId: created.data.id, confirmed: true }, undefined, true)).status, 200);
    assert.equal((await app.call('topic?id=' + created.data.id)).status, 404);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE topic_id=?').get(created.data.id).n, 0);
  } finally { app.db.close(); }
});

test('topic and message pagination use bounded indexed reads without duplicate items', async () => {
  const app = await setup();
  try {
    const topicInsert = app.db.prepare('INSERT INTO forum_topics(id,title,author_id,author_name,created_at,updated_at) VALUES(?,?,?,?,?,?)');
    for (let i = 0; i < 45; i++) topicInsert.run(String(i).padStart(3, '0'), 'Topic ' + i, 'old-user', 'Old user', i, i);
    const first = (await app.call('topics')).data;
    assert.equal(first.topics.length, 20);
    const second = (await app.call('topics?' + new URLSearchParams(first.next))).data;
    assert.equal(second.topics.length, 20);
    assert.equal(new Set([...first.topics, ...second.topics].map(item => item.id)).size, 40);
    const last = (await app.call('topics?' + new URLSearchParams(second.next))).data;
    assert.equal(last.topics.length, 5); assert.equal(last.next, null);
    const insert = app.db.prepare('INSERT INTO forum_posts(topic_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?)');
    for (let i = 0; i < 42; i++) insert.run('000', 'old-user', 'Old user', 'Message ' + i, i);
    const posts = (await app.call('topic?id=000')).data;
    assert.equal(posts.posts.length, 20);
    const next = (await app.call('topic?id=000&after=' + posts.next)).data;
    assert.equal(next.posts.length, 20);
    assert.equal(new Set([...posts.posts, ...next.posts].map(post => post.id)).size, 40);
    assert.ok(app.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM forum_posts WHERE topic_id=? AND id>? ORDER BY id LIMIT 21').all('000', 0)
      .some(row => row.detail.includes('forum_posts_topic')));
    assert.equal((await app.call('topic?id=000&after=-1')).status, 400);
  } finally { app.db.close(); }
});

test('deleting an account preserves public discussion and revokes posting access', async () => {
  const app = await setup();
  try {
    const created = await app.call('topics', { title: 'Keep discussion', body: 'Original message' }, app.alice.token);
    await accountApi(app.request('accounts/judge/delete', { id: app.alice.user.id, username: 'Alice', email: 'Alice@example.test'.toLowerCase(), confirmed: true }), app.env, true);
    assert.equal((await app.call('topic?id=' + created.data.id)).data.posts[0].authorName, 'Alice');
    assert.equal((await app.call('reply', { topicId: created.data.id, body: 'Old token' }, app.alice.token)).status, 401);
    const post = (await app.call('topic?id=' + created.data.id)).data.posts[0];
    assert.equal((await app.call('delete-post', { id: post.id, confirmed: true }, undefined, true)).status, 200);
  } finally { app.db.close(); }
});
