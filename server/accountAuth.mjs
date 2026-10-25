const encoder = new TextEncoder();
const SESSION_MS = 7 * 86400000;
const CODE_MS = 10 * 60000;
const PASSWORD_ITERATIONS = 100000; // Workers WebCrypto iteration ceiling.
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const normalize = (value) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
export const usernameKey = (value) => normalize(value).toLocaleLowerCase('en-US');
function identityInput(name, address) {
  const username = normalize(name); const key = usernameKey(username);
  const email = String(address ?? '').trim().toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,39}$/u.test(username) || username.includes('@')) fail('Vartotojo vardas turi būti 2–40 simbolių: raidės, skaičiai, tarpai, taškai, _ arba -.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Įveskite tinkamą el. paštą.');
  return { username, key, email };
}
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function keyed(value, env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail('Registracija dar neparuošta.', 503);
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function passwordHash(password, salt, env) {
  if (typeof password !== 'string' || password.length < 4 || password.length > 128) fail('Slaptažodis turi būti 4–128 simbolių.');
  // A separate server secret protects database-only leaks and is never stored in D1.
  const peppered = await keyed(`password:${password}`, env);
  const key = await crypto.subtle.importKey('raw', encoder.encode(peppered), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256));
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
function publicUser(row) { return { id: row.id, username: row.username, email: row.email, verifiedAt: row.verified_at, playerId: `account:${row.id}` }; }
function emailReady(env) { return Boolean(env.SEND_VERIFICATION || ((env.RESEND_API_KEY || env.BREVO_API_KEY) && env.EMAIL_FROM)); }
export function accountsEnabled(env) { return env.ACCOUNTS_ENABLED === 'true'; }

async function rateLimit(db, key, max, duration, now) {
  const row = await db.prepare(`INSERT INTO account_rate_limits(key,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE hits+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    RETURNING hits`).bind(key, now + duration, now, now).first();
  if (row.hits > max) fail('Per daug bandymų. Bandykite vėliau.', 429);
}
async function sendCode(env, email, code, challengeId) {
  if (env.SEND_VERIFICATION) return env.SEND_VERIFICATION({ email, code, challengeId });
  if (env.BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { email: env.EMAIL_FROM, name: 'ML mokykla' }, to: [{ email }],
        subject: 'ML Academy registracija', textContent: `Registracijos kodas: ${code}. Galioja 10 min.` }),
    });
    if (!response.ok) fail('Nepavyko issiusti kodo.', 503);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': challengeId },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: 'ML Academy – registracijos kodas',
      text: `Jūsų vienkartinis registracijos kodas: ${code}. Kodas galioja 10 minučių. Jei nesiregistravote, laišką ignoruokite.` }),
  });
  if (!response.ok) fail('Nepavyko išsiųsti kodo. Bandykite vėliau.', 503);
}
async function issueCode(row, env, now) {
  if (!emailReady(env)) fail('Laiškų siuntimas dar neparuoštas.', 503);
  await rateLimit(env.DB, `mail:${row.id}`, 5, 3600000, now);
  if (row.code_sent_at && now - row.code_sent_at < 60000) fail('Naują kodą galėsite gauti po minutės.', 429);
  const values = crypto.getRandomValues(new Uint32Array(1));
  // Rejection sampling avoids modulo bias in the six-digit code.
  while (values[0] >= 4294000000) crypto.getRandomValues(values);
  const code = String(values[0] % 1000000).padStart(6, '0');
  const challengeId = random();
  const hash = await keyed(`code:${row.id}:${challengeId}:${code}`, env);
  const result = await env.DB.prepare(`UPDATE accounts SET code_hash=?,code_expires_at=?,code_attempts=0,code_sent_at=?,challenge_id=?
    WHERE id=? AND email=? AND verified_at IS NULL AND (code_sent_at IS NULL OR code_sent_at<=?)`)
    .bind(hash, now + CODE_MS, now, challengeId, row.id, row.email, now - 60000).run();
  if (!result.meta.changes) fail('Naują kodą galėsite gauti po minutės.', 429);
  try { await sendCode(env, row.email, code, challengeId); }
  catch {
    await env.DB.prepare('UPDATE accounts SET code_hash=NULL,code_sent_at=NULL WHERE id=? AND challenge_id=?').bind(row.id, challengeId).run();
    fail('Nepavyko išsiųsti kodo. Bandykite vėliau.', 503);
  }
  return { challengeId, expiresIn: 600, message: 'Kodas išsiųstas į el. paštą.' };
}
async function createSession(row, env, now) {
  const token = random(); const id = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO account_sessions(id,account_id,token_hash,login_at,last_seen_at,expires_at)
      SELECT ?,?,?,?,?,? FROM accounts WHERE id=? AND username=? AND email=? AND verified_at IS NOT NULL`)
      .bind(id, row.id, await digest(token), now, now, now + SESSION_MS, row.id, row.username, row.email),
    env.DB.prepare('UPDATE accounts SET last_login_at=?,last_seen_at=? WHERE id=? AND EXISTS(SELECT 1 FROM account_sessions WHERE id=?)').bind(now, now, row.id, id),
    env.DB.prepare('INSERT OR IGNORE INTO players(id,name) SELECT ?,? WHERE EXISTS(SELECT 1 FROM account_sessions WHERE id=?)').bind(`account:${row.id}`, row.username, id),
  ]);
  if (!results[0].meta.changes) fail('Vartotojo duomenys pasikeitė. Atnaujinkite lentelę.', 409);
  return { user: publicUser(row), token, expiresAt: now + SESSION_MS };
}
export async function currentAccount(request, env) {
  const token = request.headers.get('X-Player-Session');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const now = Date.now();
  const row = await env.DB.prepare(`SELECT a.id,a.username,a.email,a.verified_at,s.id AS session_id,s.last_seen_at
    FROM account_sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND s.logout_at IS NULL AND s.expires_at>? AND a.verified_at IS NOT NULL`)
    .bind(await digest(token), now).first();
  if (!row) return null;
  if (now - row.last_seen_at >= 10 * 60000) {
    await env.DB.batch([
      env.DB.prepare('UPDATE account_sessions SET last_seen_at=? WHERE id=? AND last_seen_at<=?').bind(now, row.session_id, now - 10 * 60000),
      env.DB.prepare('UPDATE accounts SET last_seen_at=? WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<=?)').bind(now, row.id, now - 10 * 60000),
    ]);
  }
  return { ...publicUser(row), sessionId: row.session_id };
}
export async function recordAccountActivity(env, user, section, action) {
  if (!user) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO account_activity(id,account_id,session_id,occurred_at,section,action) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), user.id, user.sessionId, now, section, action),
    env.DB.prepare('UPDATE account_sessions SET last_seen_at=? WHERE id=? AND logout_at IS NULL').bind(now, user.sessionId),
    env.DB.prepare('UPDATE accounts SET last_seen_at=? WHERE id=?').bind(now, user.id),
  ]);
}
export async function accountApi(request, env, judge = false) {
  const url = new URL(request.url); const action = url.pathname.slice('/api/accounts/'.length);
  try {
    if (action === 'config' && request.method === 'GET') return reply({ enabled: accountsEnabled(env), registrationReady: emailReady(env) && Boolean(env.AUTH_SECRET?.length >= 32) });
    if (action.startsWith('judge/')) {
      if (!judge) fail('Reikalinga teisėjo prieiga.', 401);
      if (['judge/delete', 'judge/verify', 'judge/edit'].includes(action) && request.method === 'POST') {
        const body = await request.text();
        if (body.length > 4096) fail('Per didelė užklausa.');
        let data;
        try { data = JSON.parse(body); } catch { fail('Netinkama užklausa.'); }
        if (!data || typeof data.id !== 'string' || !data.id || data.id.length > 100 || data.confirmed !== true) fail(action === 'judge/edit' ? 'Patvirtinkite vartotojo duomenų pakeitimą.' : action === 'judge/verify' ? 'Patvirtinkite vartotojo pašto patvirtinimą.' : 'Patvirtinkite vartotojo ištrynimą.');
        const user = await env.DB.prepare('SELECT id,username,email,verified_at FROM accounts WHERE id=?').bind(data.id).first();
        if (!user) fail('Vartotojas nerastas.', 404);
        if (data.email !== user.email || data.username !== user.username) fail('Vartotojo duomenys pasikeitė. Atnaujinkite lentelę.', 409);
        if (action === 'judge/edit') {
          const next = identityInput(data.newUsername, data.newEmail);
          const emailChanged = next.email !== user.email;
          const nameChanged = next.username !== user.username;
          if (!emailChanged && !nameChanged) return reply({ saved: true, emailChanged: false });
          const params = [next.username, next.key, next.email];
          let sql = 'UPDATE accounts SET username=?,username_key=?,email=?';
          if (emailChanged) {
            sql += ',verified_at=NULL,verification_method=NULL,code_hash=NULL,code_expires_at=NULL,code_attempts=0,code_sent_at=NULL,challenge_id=?';
            params.push(random());
          }
          sql += ' WHERE id=? AND username=? AND email=?';
          params.push(user.id, user.username, user.email);
          const statements = [env.DB.prepare(sql).bind(...params)];
          // Keep every dependent write tied to the same successful optimistic update.
          const ifCurrent = (query, values) => env.DB.prepare(query + ' AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND a.username=? AND a.email=?)')
            .bind(...values, user.id, next.username, next.email);
          if (nameChanged) {
            const playerId = `account:${user.id}`;
            statements.push(
              ifCurrent('UPDATE players SET name=? WHERE id=?', [next.username, playerId]),
              ifCurrent('UPDATE sprint_sessions SET name=? WHERE player_id=?', [next.username, playerId]),
              ifCurrent('UPDATE tournament_sessions SET name=? WHERE player_id=?', [next.username, playerId]),
              ifCurrent('UPDATE forum_topics SET author_name=? WHERE author_id=?', [next.username, user.id]),
              ifCurrent('UPDATE forum_posts SET author_name=? WHERE author_id=?', [next.username, user.id]),
            );
          }
          if (emailChanged) statements.push(ifCurrent('UPDATE account_sessions SET logout_at=?,last_seen_at=? WHERE account_id=? AND logout_at IS NULL', [Date.now(), Date.now(), user.id]));
          let results;
          try { results = await env.DB.batch(statements); }
          catch (error) { if (/UNIQUE/i.test(error.message)) fail('Šis vartotojo vardas arba el. paštas jau užregistruotas.', 409); throw error; }
          if (!results[0].meta.changes) fail('Vartotojo duomenys pasikeitė. Atnaujinkite lentelę.', 409);
          return reply({ saved: true, emailChanged });
        }
        if (action === 'judge/verify') {
          if (!user.verified_at) {
            const result = await env.DB.prepare(`UPDATE accounts SET verified_at=?,verification_method='judge',code_hash=NULL,
              code_expires_at=NULL,code_attempts=0,challenge_id=NULL WHERE id=? AND username=? AND email=? AND verified_at IS NULL`)
              .bind(Date.now(), user.id, user.username, user.email).run();
            if (!result.meta.changes) fail('Vartotojo duomenys pasikeitė. Atnaujinkite lentelę.', 409);
          }
          return reply({ verified: true });
        }
        // Remove account-only data atomically. Game results retain their original player ID.
        const results = await env.DB.batch([
          env.DB.prepare('DELETE FROM account_activity WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND username=? AND email=?)').bind(user.id, user.id, user.username, user.email),
          env.DB.prepare('DELETE FROM account_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND username=? AND email=?)').bind(user.id, user.id, user.username, user.email),
          env.DB.prepare('DELETE FROM accounts WHERE id=? AND username=? AND email=?').bind(user.id, user.username, user.email),
        ]);
        if (!results.at(-1).meta.changes) fail('Vartotojo duomenys pasikeitė. Atnaujinkite lentelę.', 409);
        return reply({ deleted: true });
      }
      if (request.method !== 'GET') fail('Not found.', 404);
      if (action === 'judge/users') {
        const page = Math.max(0, Math.min(10000, Math.floor(Number(url.searchParams.get('page')) || 0)));
        const users = await env.DB.prepare(`SELECT id,username,email,created_at,verified_at,verification_method,last_login_at,last_seen_at
          FROM accounts ORDER BY created_at DESC,id LIMIT 51 OFFSET ?`).bind(page * 50).all();
        return reply({ users: users.results.slice(0, 50), hasMore: users.results.length > 50, page });
      }
      if (action === 'judge/history') {
        const id = url.searchParams.get('id') || '';
        const [sessions, activity] = await Promise.all([
          env.DB.prepare(`SELECT id,login_at,last_seen_at,expires_at,logout_at FROM account_sessions WHERE account_id=? ORDER BY login_at DESC LIMIT 50`).bind(id).all(),
          env.DB.prepare(`SELECT occurred_at,section,action FROM account_activity WHERE account_id=? ORDER BY occurred_at DESC LIMIT 100`).bind(id).all(),
        ]);
        return reply({ sessions: sessions.results, activity: activity.results });
      }
      fail('Not found.', 404);
    }
    if (!accountsEnabled(env)) fail('Paskyros dar neįjungtos.', 503);
    if (action === 'me' && request.method === 'GET') return reply({ user: await currentAccount(request, env) });
    if (request.method !== 'POST') fail('Not found.', 404);
    const text = await request.text();
    if (text.length > 4096) fail('Per didelė užklausa.');
    let data;
    try { data = JSON.parse(text); } catch { fail('Netinkama užklausa.'); }
    if (!data || Array.isArray(data) || typeof data !== 'object') fail('Netinkama užklausa.');
    const now = Date.now(); const db = env.DB;
    if (action === 'logout') {
      const user = await currentAccount(request, env);
      if (user) await db.batch([
        db.prepare('UPDATE account_sessions SET logout_at=?,last_seen_at=? WHERE id=?').bind(now, now, user.sessionId),
        db.prepare('UPDATE accounts SET last_seen_at=? WHERE id=?').bind(now, user.id),
      ]);
      return reply({ loggedOut: true });
    }
    if (!['register', 'verify', 'resend', 'login'].includes(action)) fail('Not found.', 404);
    const ip = await keyed(`ip:${request.headers.get('CF-Connecting-IP') || 'local'}`, env);
    await rateLimit(db, `ip:${action}:${ip}`, action === 'login' ? 30 : 10, 3600000, now);
    if (action === 'register') {
      if (!emailReady(env)) fail('Laiškų siuntimas dar neparuoštas.', 503);
      const { username, key, email } = identityInput(data.username, data.email);
      const salt = random(); const password = await passwordHash(data.password, salt, env);
      const id = crypto.randomUUID();
      try { await db.prepare('INSERT INTO accounts(id,username,username_key,email,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(id, username, key, email, password, salt, now).run(); }
      catch (error) { if (/UNIQUE/i.test(error.message)) fail('Šis vartotojo vardas arba el. paštas jau užregistruotas.'); throw error; }
      const row = { id, email };
      return reply(await issueCode(row, env, now), 201);
    }
    if (action === 'resend') {
      // Resending requires the registration challenge, never an arbitrary email address.
      const row = await db.prepare('SELECT * FROM accounts WHERE challenge_id=? AND verified_at IS NULL').bind(String(data.challengeId || '')).first();
      if (!row) fail('Registracija nerasta.');
      return reply(await issueCode(row, env, now));
    }
    if (action === 'verify') {
      if (!/^\d{6}$/.test(String(data.code ?? ''))) fail('Įveskite šešių skaitmenų kodą.');
      const row = await db.prepare('SELECT * FROM accounts WHERE challenge_id=? AND verified_at IS NULL').bind(String(data.challengeId || '')).first();
      if (!row || !row.code_hash || row.code_expires_at <= now || row.code_attempts >= 5) fail('Kodas nebegalioja. Paprašykite naujo.');
      const expected = await keyed(`code:${row.id}:${row.challenge_id}:${data.code}`, env);
      if (!equal(expected, row.code_hash)) {
        await db.prepare('UPDATE accounts SET code_attempts=code_attempts+1 WHERE id=? AND challenge_id=? AND verified_at IS NULL').bind(row.id, row.challenge_id).run();
        fail('Neteisingas kodas.');
      }
      const result = await db.prepare(`UPDATE accounts SET verified_at=?,verification_method='email',code_hash=NULL,code_expires_at=NULL
        WHERE id=? AND challenge_id=? AND code_hash=? AND verified_at IS NULL AND code_attempts<5 AND code_expires_at>?`)
        .bind(now, row.id, row.challenge_id, expected, now).run();
      if (!result.meta.changes) fail('Kodas nebegalioja.');
      return reply(await createSession({ ...row, verified_at: now }, env, now));
    }
    const login = usernameKey(data.login);
    await rateLimit(db, `login:${await digest(login)}`, 10, 15 * 60000, now);
    const row = await db.prepare('SELECT * FROM accounts WHERE username_key=? OR email=?').bind(login, login).first();
    const salt = row?.salt || 'unregistered-account-salt';
    const hash = await passwordHash(data.password, salt, env);
    if (!row || !equal(hash, row.password_hash)) fail('Neteisingas prisijungimo vardas arba slaptažodis.', 401);
    if (!row.verified_at) {
      return reply({ needsVerification: true, challengeId: row.challenge_id, message: 'Patvirtinkite el. paštą. Jei kodas nebegalioja, paprašykite naujo.' });
    }
    return reply(await createSession(row, env, now));
  } catch (error) {
    if (!error.status) console.error('Account API failed:', error.message);
    return reply({ error: error.status ? error.message : 'Paskyrų serveris nepasiekiamas. Bandykite vėliau.' }, error.status || 503);
  }
}

// Enforce identity on the server, even when someone edits a request in their browser.
export async function authorizeGameRequest(request, env) {
  if (!accountsEnabled(env)) return { request, user: null };
  const url = new URL(request.url); const path = url.pathname;
  const section = path.split('/')[2]; const action = path.split('/')[3];
  const privatePost = request.method === 'POST' && ((section === 'solving' && ['start', 'answer'].includes(action))
    || (['sprint', 'tournaments'].includes(section) && ['start', 'submit'].includes(action)));
  const privateGet = request.method === 'GET' && ((section === 'solving' && action === 'series') || (section === 'sprint' && (action === 'session' || url.searchParams.has('sessionId'))));
  const user = await currentAccount(request, env);
  if ((privatePost || privateGet) && !user) fail('Norėdami spręsti, prisijunkite.', 401);
  if (user && privatePost) {
    const text = await request.text();
    if (text.length > 160000) fail('Per didelė užklausa.');
    let data;
    try { data = JSON.parse(text); } catch { fail('Netinkama užklausa.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Netinkama užklausa.');
    if (['sprint', 'tournaments'].includes(section) && action === 'submit') {
      const table = section === 'sprint' ? 'sprint_sessions' : 'tournament_sessions';
      const owned = await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND player_id=?`).bind(String(data.sessionId || ''), user.playerId).first();
      if (!owned) fail('Šis sprendimas priklauso kitam vartotojui.', 403);
    }
    data.name = user.username;
    request = new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(data) });
  }
  if (section === 'sprint' && url.searchParams.has('sessionId')) {
    const owned = await env.DB.prepare('SELECT id FROM sprint_sessions WHERE id=? AND player_id=?').bind(url.searchParams.get('sessionId'), user.playerId).first();
    if (!owned) fail('Šis sprendimas priklauso kitam vartotojui.', 403);
  }
  if (['solving', 'sprint'].includes(section) && ['catalog', 'calendar', 'series', 'session'].includes(action)) {
    url.searchParams.set('name', user?.username || '');
    request = new Request(url, request);
  }
  return { request, user };
}
