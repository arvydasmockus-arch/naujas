import { currentAccount, accountsEnabled } from './accountAuth.mjs';

const PAGE_SIZE = 20;
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function fail(code, status = 400) { throw Object.assign(new Error(code), { status }); }
function clean(value, max, code) {
  if (typeof value !== 'string') fail(code);
  const text = value.normalize('NFC').trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail(code);
  return text;
}
async function limit(db, user, kind, maximum, duration) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO account_rate_limits(key,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE hits+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING hits`)
    .bind(`forum:${kind}:${user.id}`, now + duration, now, now).first();
  if (row.hits > maximum) fail('FORUM_RATE_LIMIT', 429);
}
function number(value, fallback = 0) {
  const result = Number(value ?? fallback);
  if (!Number.isSafeInteger(result) || result < 0) fail('FORUM_INVALID_REQUEST');
  return result;
}

export async function forumApi(request, env, judge = false) {
  const db = env.DB;
  const url = new URL(request.url);
  const action = url.pathname.slice('/api/forum/'.length);
  try {
    if (request.method === 'GET' && action === 'topics') {
      const beforeTime = url.searchParams.get('beforeTime');
      const beforeId = url.searchParams.get('beforeId');
      if (beforeTime !== null && (!beforeId || beforeId.length > 100)) fail('FORUM_INVALID_REQUEST');
      const sql = 'SELECT id,title,author_name AS authorName,created_at AS createdAt,updated_at AS updatedAt,post_count AS postCount FROM forum_topics '
        + (beforeTime === null ? '' : 'WHERE (updated_at,id)<(?,?) ')
        + 'ORDER BY updated_at DESC,id DESC LIMIT 21';
      const rows = await (beforeTime === null ? db.prepare(sql) : db.prepare(sql).bind(number(beforeTime), beforeId)).all();
      const topics = rows.results.slice(0, PAGE_SIZE);
      const last = topics.at(-1);
      return reply({ topics, next: rows.results.length > PAGE_SIZE ? { beforeTime: last.updatedAt, beforeId: last.id } : null });
    }
    if (request.method === 'GET' && action === 'topic') {
      const id = url.searchParams.get('id');
      if (!id || id.length > 100) fail('FORUM_INVALID_REQUEST');
      const topic = await db.prepare('SELECT id,title,author_id AS authorId,author_name AS authorName,created_at AS createdAt,post_count AS postCount FROM forum_topics WHERE id=?').bind(id).first();
      if (!topic) fail('FORUM_TOPIC_NOT_FOUND', 404);
      const rows = await db.prepare(`SELECT id,author_id AS authorId,author_name AS authorName,body,created_at AS createdAt,edited_at AS editedAt,deleted_at AS deletedAt
        FROM forum_posts WHERE topic_id=? AND id>? ORDER BY id LIMIT 21`).bind(id, number(url.searchParams.get('after'))).all();
      const posts = rows.results.slice(0, PAGE_SIZE);
      return reply({ topic, posts, next: rows.results.length > PAGE_SIZE ? posts.at(-1).id : null });
    }
    if (request.method !== 'POST' || !['topics', 'reply', 'edit', 'delete-post', 'delete-topic'].includes(action)) fail('FORUM_NOT_FOUND', 404);
    const body = await request.text();
    if (body.length > 14000) fail('FORUM_INVALID_REQUEST');
    let data;
    try { data = JSON.parse(body); } catch { fail('FORUM_INVALID_REQUEST'); }
    if (!data || Array.isArray(data) || typeof data !== 'object') fail('FORUM_INVALID_REQUEST');
    const moderator = judge && ['delete-post', 'delete-topic'].includes(action);
    const user = moderator ? null : accountsEnabled(env) ? await currentAccount(request, env) : null;
    if (!moderator && !user) fail('FORUM_LOGIN_REQUIRED', 401);
    const now = Date.now();
    if (action === 'topics') {
      const title = clean(data.title, 140, 'FORUM_INVALID_TITLE').replace(/\s+/g, ' ');
      const text = clean(data.body, 10000, 'FORUM_INVALID_BODY');
      await limit(db, user, 'topic', 5, 3600000);
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare('INSERT INTO forum_topics(id,title,author_id,author_name,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id, title, user.id, user.username, now, now),
        db.prepare('INSERT INTO forum_posts(topic_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?)').bind(id, user.id, user.username, text, now),
      ]);
      return reply({ id }, 201);
    }
    if (action === 'reply') {
      const id = clean(data.topicId, 100, 'FORUM_INVALID_REQUEST');
      const text = clean(data.body, 10000, 'FORUM_INVALID_BODY');
      if (!await db.prepare('SELECT id FROM forum_topics WHERE id=?').bind(id).first()) fail('FORUM_TOPIC_NOT_FOUND', 404);
      await limit(db, user, 'reply', 30, 600000);
      const results = await db.batch([
        db.prepare('INSERT INTO forum_posts(topic_id,author_id,author_name,body,created_at) VALUES(?,?,?,?,?)').bind(id, user.id, user.username, text, now),
        db.prepare('UPDATE forum_topics SET post_count=post_count+1,updated_at=? WHERE id=?').bind(now, id),
      ]);
      return reply({ id: results[0].meta.last_row_id }, 201);
    }
    if (action === 'delete-topic') {
      if (!judge) fail('FORUM_FORBIDDEN', 403);
      if (data.confirmed !== true) fail('FORUM_CONFIRM_REQUIRED');
      const id = clean(data.topicId, 100, 'FORUM_INVALID_REQUEST');
      if (!await db.prepare('SELECT id FROM forum_topics WHERE id=?').bind(id).first()) fail('FORUM_TOPIC_NOT_FOUND', 404);
      await db.batch([db.prepare('DELETE FROM forum_posts WHERE topic_id=?').bind(id), db.prepare('DELETE FROM forum_topics WHERE id=?').bind(id)]);
      return reply({ deleted: true });
    }
    const id = number(data.id);
    const post = await db.prepare('SELECT id,author_id,deleted_at FROM forum_posts WHERE id=?').bind(id).first();
    if (!post || post.deleted_at) fail('FORUM_POST_NOT_FOUND', 404);
    if (!moderator && post.author_id !== user.id) fail('FORUM_FORBIDDEN', 403);
    if (action === 'edit') {
      const text = clean(data.body, 10000, 'FORUM_INVALID_BODY');
      await limit(db, user, 'edit', 60, 600000);
      const result = await db.prepare('UPDATE forum_posts SET body=?,edited_at=? WHERE id=? AND deleted_at IS NULL').bind(text, now, id).run();
      if (!result.meta.changes) fail('FORUM_POST_NOT_FOUND', 404);
      return reply({ saved: true });
    }
    if (data.confirmed !== true) fail('FORUM_CONFIRM_REQUIRED');
    await db.prepare("UPDATE forum_posts SET body='',deleted_at=? WHERE id=? AND deleted_at IS NULL").bind(now, id).run();
    return reply({ deleted: true });
  } catch (error) {
    if (!error.status) console.error('Forum API:', error.message);
    return reply({ error: error.status ? error.message : 'FORUM_UNAVAILABLE' }, error.status || 503);
  }
}
