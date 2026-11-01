import { currentAccount } from './accountAuth.mjs';

export const ISC_TIMEZONE = 'Europe/Berlin'; // CET in winter, CEST in summer.
export const ISC_DURATION = 2 * 60 * 60 * 1000;
export const ISC_SOLUTIONS_DELAY = 3 * 60 * 60 * 1000;
const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const rows = async (statement) => (await statement.all()).results ?? [];

export function iscStart(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) error('Choose a Sunday for ISC training.');
  const midday = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(midday) || new Date(midday).toISOString().slice(0, 10) !== date || new Date(midday).getUTCDay() !== 0) error('Choose a Sunday for ISC training.');
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ISC_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(midday));
  return Date.parse(`${date}T11:00:00Z`) - (hour - 12) * 3600000;
}

export function iscState(row, now = Date.now(), judge = false) {
  if (row.starts_at == null) return null;
  return { startsAt: row.starts_at, endsAt: row.starts_at + ISC_DURATION, solutionsAt: row.starts_at + ISC_SOLUTIONS_DELAY,
    timezone: ISC_TIMEZONE, announced: Boolean(row.announced), armed: Boolean(row.armed),
    problemsAvailable: Boolean(row.armed && now >= row.starts_at),
    solutionsAvailable: Boolean(row.armed && now >= row.starts_at + ISC_SOLUTIONS_DELAY),
    ...(judge ? { generateAt: row.generate_at } : {}) };
}

export async function guardIsc(db, id, action, accountId, now = Date.now()) {
  const row = await db.prepare('SELECT * FROM isc_trainings WHERE tournament_id=?').bind(id).first();
  if (!row) return null;
  const state = iscState(row, now);
  if (['settings', 'replace', 'generate', 'delete'].includes(action)) {
    if (row.armed) error('Disarm ISC training before editing its problems or deleting it.');
    if (now >= row.starts_at) error('ISC training can no longer be edited after its start.');
  }
  if (['start', 'submit'].includes(action)) {
    if (!accountId || !await db.prepare('SELECT 1 AS found FROM isc_registrations WHERE tournament_id=? AND account_id=?').bind(id, accountId).first()) error('Register for this ISC training first.', 403);
    if (!row.announced || !state.problemsAvailable) error('ISC training has not started yet.');
    if (action === 'start' && now >= state.endsAt) {
      // Allow restoration of an existing session after the deadline, never a new one.
      if (!await db.prepare('SELECT id FROM tournament_sessions WHERE tournament_id=? AND player_id=?').bind(id, `account:${accountId}`).first()) error('ISC training has ended.');
    }
    if (action === 'submit' && now > state.endsAt) error('The two-hour session has ended.');
  }
  return state;
}

async function job(db, id, kind, when) {
  return db.prepare(`INSERT INTO isc_jobs(id,tournament_id,kind,run_at) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET run_at=excluded.run_at,status='pending',attempts=0,last_error=''`)
    .bind(`${id}:${kind}`, id, kind, when);
}

export async function frozenIscPdf(db, id, kind) {
  const row = await db.prepare(`SELECT p.content,t.id,t.title,t.number,t.date FROM isc_pdfs p
    JOIN tournaments t ON t.id=p.tournament_id JOIN isc_trainings i ON i.tournament_id=p.tournament_id
    WHERE p.tournament_id=? AND p.kind=? AND p.revision=i.revision`).bind(id, kind).first();
  if (!row) error('Prepare both ISC PDFs before approving the start.');
  return { event: { id: row.id, title: row.title, date: row.date, number: row.number,
    displayTitle: `${row.title} No. ${row.number} — ${row.date.replaceAll('-', '.')}` }, pdf: row.content };
}

export async function iscApi(request, env, judge, dependencies) {
  const db = env.DB; const url = new URL(request.url);
  const action = url.pathname.split('/isc/')[1]; const now = Date.now();
  try {
    if (request.method === 'GET' && action === 'details') {
      const id = url.searchParams.get('id');
      const row = await db.prepare('SELECT * FROM isc_trainings WHERE tournament_id=?').bind(id).first();
      if (!row || (!judge && !row.announced)) error('Tournament not found.', 404);
      const participants = await rows(db.prepare(`SELECT a.id,a.username,r.registered_at AS registeredAt
        FROM isc_registrations r JOIN accounts a ON a.id=r.account_id WHERE r.tournament_id=? ORDER BY r.registered_at,a.username`).bind(id));
      const user = request.headers.has('X-Player-Session') ? await currentAccount(request, env) : null;
      const jobs = judge ? await rows(db.prepare('SELECT kind,status,run_at AS runAt,attempts,last_error AS error FROM isc_jobs WHERE tournament_id=?').bind(id)) : undefined;
      const mail = judge ? await rows(db.prepare('SELECT kind,status,COUNT(*) AS count,MAX(last_error) AS error FROM isc_mail WHERE tournament_id=? GROUP BY kind,status').bind(id)) : undefined;
      return reply({ participants: participants.map(({ username, registeredAt }) => ({ username, registeredAt })),
        registered: participants.some((p) => p.id === user?.id), ...(judge ? { jobs, mail, emailReady: Boolean(env.BREVO_API_KEY && env.EMAIL_FROM) } : {}) });
    }
    if (request.method !== 'POST') error('Not found.', 404);
    const text = await request.text(); if (text.length > 4096) error('Request too large.');
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) error('Invalid request data.');
    if (action === 'register' || action === 'unregister') {
      const user = await currentAccount(request, env); if (!user) error('Log in to register for ISC training.', 401);
      const event = await db.prepare('SELECT * FROM isc_trainings WHERE tournament_id=?').bind(data.id).first();
      if (!event?.announced) error('Tournament not found.', 404);
      if (now >= event.starts_at) error('Registration is closed.');
      if (action === 'register') await db.prepare(`INSERT OR IGNORE INTO isc_registrations(tournament_id,account_id,registered_at)
        SELECT tournament_id,?,? FROM isc_trainings WHERE tournament_id=? AND announced=1 AND starts_at>?`).bind(user.id, now, data.id, now).run();
      else await db.prepare('DELETE FROM isc_registrations WHERE tournament_id=? AND account_id=?').bind(data.id, user.id).run();
      return reply({ saved: true });
    }
    if (!judge) error('Judge access required.', 401);
    if (action === 'create') {
      const startsAt = iscStart(data.date); if (startsAt <= now) error('Choose a future Sunday.');
      const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'ISC Training';
      if (title.length > 140) error('Enter a title (max. 140 characters).');
      const generateAt = data.generateAt == null || data.generateAt === '' ? null : Number(data.generateAt);
      if (generateAt !== null && (!Number.isFinite(generateAt) || generateAt <= now || generateAt >= startsAt)) error('Generation must be scheduled before the ISC start and after now.');
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare(`INSERT INTO tournaments(id,title,date,mode,status,created_at,weekly,number)
          SELECT ?,?,?,'competition','draft',?,0,CAST(value AS INTEGER) FROM metadata WHERE key='tournament_next_number'`).bind(id, title, data.date, now),
        db.prepare("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='tournament_next_number'"),
        db.prepare('INSERT INTO isc_trainings(tournament_id,starts_at,generate_at) VALUES(?,?,?)').bind(id, startsAt, generateAt),
        ...(generateAt === null ? [] : [await job(db, id, 'generate', generateAt)]),
      ]);
      return reply({ id });
    }
    const row = await db.prepare('SELECT * FROM isc_trainings WHERE tournament_id=?').bind(data.id).first();
    if (!row) error('Tournament not found.', 404);
    if (action === 'retry') {
      if (data.confirmed !== true) error('Confirm retrying failed deliveries.');
      await db.batch([
        db.prepare("UPDATE isc_jobs SET status='pending',attempts=0,run_at=?,last_error='' WHERE tournament_id=? AND status='failed'").bind(now, data.id),
        db.prepare("UPDATE isc_mail SET status='pending',attempts=0,first_attempt_at=NULL,run_at=?,last_error='' WHERE tournament_id=? AND status='failed'").bind(now, data.id),
      ]); return reply({ saved: true });
    }
    if (now >= row.starts_at) error('ISC training can no longer be edited after its start.');
    if (action === 'announce') {
      if (row.armed) error('Disarm ISC training before editing its problems or deleting it.');
      await db.prepare('UPDATE isc_trainings SET announced=? WHERE tournament_id=?').bind(data.announced === true ? 1 : 0, data.id).run();
    } else if (action === 'generate') {
      await guardIsc(db, data.id, 'generate');
      const existing = await db.prepare('SELECT COUNT(*) AS n FROM tournament_problems WHERE tournament_id=?').bind(data.id).first();
      if (existing.n) error('The ISC problem set has already been generated.');
      await dependencies.generate(data.id);
      await db.prepare("UPDATE isc_jobs SET status='done',last_error='' WHERE id=?").bind(`${data.id}:generate`).run();
    } else if (action === 'prepare') {
      await guardIsc(db, data.id, 'settings');
      if (!['problems', 'solutions'].includes(data.kind)) error('Invalid PDF kind.');
      const event = await dependencies.event(data.id);
      if (event.puzzles.length !== 6) error('Generate and review all six ISC problems first.');
      const content = Buffer.from(await dependencies.pdf(event, data.kind)).toString('base64');
      if (content.length > 1500000) error('ISC PDF is too large.');
      const saved = await db.prepare(`INSERT INTO isc_pdfs(tournament_id,kind,revision,content)
        SELECT tournament_id,?,revision,? FROM isc_trainings WHERE tournament_id=? AND revision=? AND armed=0 AND starts_at>?
        ON CONFLICT(tournament_id,kind) DO UPDATE SET revision=excluded.revision,content=excluded.content`)
        .bind(data.kind, content, data.id, row.revision, Date.now()).run();
      if (!saved.meta.changes) error('ISC training changed. Refresh and prepare the PDFs again.');
    } else if (action === 'arm') {
      if (data.reviewed !== true) error('Review the solutions, difficulty and scoring before publishing a competition.');
      if (!env.BREVO_API_KEY || !env.EMAIL_FROM) error('Email delivery is not configured.');
      const count = await db.prepare('SELECT COUNT(*) AS n FROM tournament_problems WHERE tournament_id=?').bind(data.id).first();
      if (count.n !== 6) error('Generate and review all six ISC problems first.');
      if (!row.announced) error('Announce ISC training before arming the start.');
      const prepared = await db.prepare('SELECT COUNT(*) AS n FROM isc_pdfs WHERE tournament_id=? AND revision=?').bind(data.id, row.revision).first();
      if (prepared.n !== 2) error('Prepare both ISC PDFs before approving the start.');
      const armed = await db.batch([
        db.prepare(`UPDATE isc_trainings SET armed=1 WHERE tournament_id=? AND revision=? AND starts_at>?
          AND (SELECT COUNT(*) FROM isc_pdfs p WHERE p.tournament_id=isc_trainings.tournament_id AND p.revision=isc_trainings.revision)=2`)
          .bind(data.id, row.revision, Date.now()),
        ...[['problems', row.starts_at], ['solutions', row.starts_at + ISC_SOLUTIONS_DELAY]].map(([kind, when]) =>
          db.prepare(`INSERT INTO isc_jobs(id,tournament_id,kind,run_at)
            SELECT ?,tournament_id,?,? FROM isc_trainings WHERE tournament_id=? AND armed=1 AND revision=? AND starts_at>?
            ON CONFLICT(id) DO UPDATE SET run_at=excluded.run_at,status='pending',attempts=0,last_error=''`)
            .bind(`${data.id}:${kind}`, kind, when, data.id, row.revision, Date.now())),
      ]);
      if (!armed[0].meta.changes) error('ISC training changed. Refresh and prepare the PDFs again.');
    } else if (action === 'disarm') {
      await db.batch([db.prepare('UPDATE isc_trainings SET armed=0 WHERE tournament_id=?').bind(data.id),
        db.prepare("DELETE FROM isc_jobs WHERE tournament_id=? AND kind IN ('problems','solutions')").bind(data.id)]);
    } else error('Not found.', 404);
    return reply({ saved: true });
  } catch (cause) { return reply({ error: cause.message }, cause.status || 400); }
}

async function sendMail(env, mail, event, pdf) {
  const body = { sender: { email: env.EMAIL_FROM, name: 'ML mokykla' }, to: [{ email: mail.email, name: mail.username }],
    subject: `${event.displayTitle} — ${mail.kind === 'problems' ? 'Problems / Uždaviniai' : 'Solutions / Sprendimai'}`,
    textContent: `${event.displayTitle}\n11:00–13:00 CET / CEST. Solutions at 14:00 CET / CEST.\nhttps://ml-mokykla.pages.dev/?page=training&set=${encodeURIComponent(event.id)}\n\nPDF attached. / PDF rinkinys prisegtas.`,
    headers: { idempotencyKey: mail.id }, attachment: [{ name: `ISC-${event.date}-${mail.kind}.pdf`, content: typeof pdf === 'string' ? pdf : Buffer.from(pdf).toString('base64') }] };
  if (env.SEND_ISC_EMAIL) return env.SEND_ISC_EMAIL(body); // Isolated tests only.
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM) throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    let result = {}; try { result = await response.json(); } catch { /* No provider response body. */ }
    if (result.code === 'duplicate_parameter') return; // Provider accepted the same delivery already.
    throw new Error(`Email provider rejected delivery (${response.status}, ${String(result.code || 'unavailable').slice(0, 80)}).`);
  }
}

// One recipient per queue invocation keeps attachment encoding within the free CPU budget.
export async function deliverIscMail(env, id, lease, now = Date.now()) {
  const db = env.DB;
  const mail = await db.prepare(`SELECT m.*,a.email,a.username,a.verified_at,i.starts_at,i.armed,i.announced
    FROM isc_mail m JOIN accounts a ON a.id=m.account_id JOIN isc_trainings i ON i.tournament_id=m.tournament_id
    WHERE m.id=? AND m.status='pending' AND m.run_at=? AND m.processing_token=''`).bind(id, lease).first();
  if (!mail) return;
  const token = crypto.randomUUID();
  const claim = await db.prepare(`UPDATE isc_mail SET processing_token=?,first_attempt_at=COALESCE(first_attempt_at,?)
    WHERE id=? AND status='pending' AND run_at=? AND processing_token=''`).bind(token, now, id, lease).run();
  if (!claim.meta.changes) return;
  try {
    if (mail.first_attempt_at && now - mail.first_attempt_at > 25 * 60000) throw new Error('Delivery needs judge review: retry window expired.');
    if (!mail.verified_at) throw new Error('The registered account email is no longer verified.');
    const state = iscState(mail, now);
    if (!state.announced || !(mail.kind === 'problems' ? state.problemsAvailable : state.solutionsAvailable)) throw new Error('ISC PDF is not available yet.');
    const { event, pdf } = await frozenIscPdf(db, mail.tournament_id, mail.kind);
    await sendMail(env, mail, event, pdf);
    await db.prepare("UPDATE isc_mail SET status='sent',sent_at=?,last_error='',processing_token='' WHERE id=? AND processing_token=?").bind(now, id, token).run();
  } catch (cause) {
    const exhausted = mail.attempts >= 5 || (mail.first_attempt_at && now - mail.first_attempt_at > 25 * 60000);
    await db.prepare("UPDATE isc_mail SET status=?,run_at=?,last_error=?,processing_token='' WHERE id=? AND processing_token=?")
      .bind(exhausted ? 'failed' : 'pending', now + 120000, String(cause.message).slice(0, 500), id, token).run();
  }
}

// Only indexed due jobs/outbox entries are read. No calendar, pool or account scan on an idle tick.
export async function runIscSchedule(env, dependencies, now = Date.now()) {
  const db = env.DB;
  const due = await rows(db.prepare("SELECT * FROM isc_jobs WHERE status='pending' AND run_at<=? ORDER BY run_at LIMIT 1").bind(now));
  for (const item of due) {
    const claim = await db.prepare("UPDATE isc_jobs SET run_at=?,attempts=attempts+1 WHERE id=? AND status='pending' AND run_at=?").bind(now + 15 * 60000, item.id, item.run_at).run();
    if (!claim.meta.changes) continue;
    try {
      const event = await db.prepare('SELECT * FROM isc_trainings WHERE tournament_id=?').bind(item.tournament_id).first();
      if (!event) continue;
      if (item.kind === 'generate') {
        if (now >= event.starts_at) throw new Error('The generation deadline has passed.');
        const existing = await db.prepare('SELECT COUNT(*) AS n FROM tournament_problems WHERE tournament_id=?').bind(item.tournament_id).first();
        if (!existing.n) await dependencies.generate(item.tournament_id);
      } else {
        if (!event.armed || !event.announced) throw new Error('ISC training is not announced and armed.');
        // One durable delivery per registered account. Never put participants together in To/Cc.
        await db.prepare(`INSERT OR IGNORE INTO isc_mail(id,tournament_id,account_id,kind,run_at)
          SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
            r.tournament_id,r.account_id,?,? FROM isc_registrations r WHERE r.tournament_id=?`)
          .bind(item.kind, now, item.tournament_id).run();
      }
      await db.prepare("UPDATE isc_jobs SET status='done',last_error='' WHERE id=?").bind(item.id).run();
    } catch (cause) {
      await db.prepare('UPDATE isc_jobs SET status=?,run_at=?,last_error=? WHERE id=?')
        .bind(item.attempts >= 4 ? 'failed' : 'pending', now + 120000, String(cause.message).slice(0, 500), item.id).run();
    }
  }
  // Generation uses its own invocation budget. Sending resumes on the next minute.
  if (due.some((item) => item.kind === 'generate')) return;
  const pending = await rows(db.prepare(`SELECT m.*,a.email,a.username,a.verified_at,i.starts_at,i.armed,i.announced
    FROM isc_mail m JOIN accounts a ON a.id=m.account_id JOIN isc_trainings i ON i.tournament_id=m.tournament_id
    WHERE m.status='pending' AND m.run_at<=? ORDER BY m.run_at LIMIT 30`).bind(now));
  if (!pending.length) return;
  // One PDF pair/event per tick keeps D1 and fetch calls below the free invocation limits.
  const group = pending.filter((mail) => mail.tournament_id === pending[0].tournament_id && mail.kind === pending[0].kind);
  const lease = now + 15 * 60000;
  const claims = await db.batch(group.map((mail) => db.prepare(`UPDATE isc_mail SET run_at=?,attempts=attempts+1,processing_token='',
    first_attempt_at=CASE WHEN ? THEN first_attempt_at ELSE COALESCE(first_attempt_at,?) END
    WHERE id=? AND status='pending' AND run_at=?`).bind(lease, Number(Boolean(env.ISC_MAIL_QUEUE)), now, mail.id, mail.run_at)));
  const pdfs = new Map();
  const updates = [];
  const claimed = group.filter((_, index) => claims[index].meta.changes);
  if (env.ISC_MAIL_QUEUE) {
    if (!claimed.length) return;
    try {
      await env.ISC_MAIL_QUEUE.sendBatch(claimed.map((mail) => ({ body: { type: 'isc-mail', id: mail.id, lease } })));
    } catch {
      await db.batch(claimed.map((mail) => db.prepare("UPDATE isc_mail SET run_at=?,last_error='Email queue is unavailable.' WHERE id=? AND run_at=?")
        .bind(now + 120000, mail.id, lease)));
    }
    return;
  }

  for (let index = 0; index < claimed.length; index += 5) {
    await Promise.all(claimed.slice(index, index + 5).map(async (mail) => {
      try {
        // Stop uncertain retries before the provider's 30-minute deduplication window expires.
        if (mail.first_attempt_at && now - mail.first_attempt_at > 25 * 60000) throw new Error('Delivery needs judge review: retry window expired.');
        if (!mail.verified_at) throw new Error('The registered account email is no longer verified.');
        const state = iscState(mail, now);
        if (!state?.announced || !(mail.kind === 'problems' ? state.problemsAvailable : state.solutionsAvailable)) throw new Error('ISC PDF is not available yet.');
        const cacheKey = `${mail.tournament_id}:${mail.kind}`;
        if (!pdfs.has(cacheKey)) {
          pdfs.set(cacheKey, frozenIscPdf(db, mail.tournament_id, mail.kind));
        }
        const { event, pdf } = await pdfs.get(cacheKey);
        await sendMail(env, mail, event, pdf);
        updates.push(db.prepare("UPDATE isc_mail SET status='sent',sent_at=?,last_error='' WHERE id=? AND run_at=?").bind(now, mail.id, lease));
      } catch (cause) {
        const exhausted = mail.attempts >= 4 || (mail.first_attempt_at && now - mail.first_attempt_at > 25 * 60000);
        updates.push(db.prepare('UPDATE isc_mail SET status=?,run_at=?,last_error=? WHERE id=? AND run_at=?')
          .bind(exhausted ? 'failed' : 'pending', now + 120000, String(cause.message).slice(0, 500), mail.id, lease));
      }
    }));
  }
  if (updates.length) await db.batch(updates);
}
