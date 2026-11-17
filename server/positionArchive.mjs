import { Chess } from 'chess.js';
import { accountsEnabled, currentAccount } from './accountAuth.mjs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }

export async function positionArchiveApi(request, env, judge = false) {
  try {
    if (!accountsEnabled(env)) fail('Paskyros dar neįjungtos.', 503);
    if (request.method === 'GET' && new URL(request.url).pathname === '/api/positions/shared') {
      if (!judge) fail('Teisėjo prieiga reikalinga.', 401);
      const rows = await env.DB.prepare(`SELECT p.id,p.account_id AS accountId,a.username AS author,
        p.position_number AS number,p.fen,p.stipulation,p.created_at AS createdAt
        FROM saved_positions p JOIN accounts a ON a.id=p.account_id ORDER BY p.created_at DESC,p.position_number`)
        .all();
      return json({ positions: rows.results ?? [] });
    }
    const user = await currentAccount(request, env);
    if (!user && request.headers.has('X-Player-Session')) fail('Prisijungimo sesija nebegalioja. Prisijunkite iš naujo.', 401);

    if (request.method === 'GET' && new URL(request.url).pathname === '/api/positions') {
      if (!user) {
        const rows = await env.DB.prepare(`SELECT id,number,fen,stipulation,created_at AS createdAt
          FROM anonymous_positions ORDER BY number`).all();
        return json({ positions: rows.results ?? [] });
      }
      const rows = await env.DB.prepare(`SELECT id,position_number AS number,fen,stipulation,created_at AS createdAt
        FROM saved_positions WHERE account_id=? ORDER BY position_number`).bind(user.id).all();
      return json({ positions: rows.results ?? [] });
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/api/positions') {
      const text = await request.text();
      if (text.length > 20000) fail('Per didelė užklausa.');
      let data;
      try { data = JSON.parse(text); } catch { fail('Netinkama užklausa.'); }
      if (!data || typeof data.fen !== 'string' || data.fen.length > 256 || typeof data.stipulation !== 'string') fail('Patikrinkite poziciją ir sąlygą.');
      let fen;
      try { fen = new Chess(data.fen.trim()).fen(); } catch { fail('FEN pozicija neteisinga.'); }
      const stipulation = data.stipulation.trim().toLowerCase().replace(/^([hs])(?=\d)/, '$1#');
      if (!/^(?:#\d{1,2}|h#?\d{1,2}|s#?\d{1,2}|[+=])$/.test(stipulation)) fail('Uždavinio sąlyga neteisinga.');
      const id = crypto.randomUUID(); const createdAt = Date.now();
      if (!user) {
        const publicId = typeof data.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(data.id) ? data.id : id;
        await env.DB.prepare(`INSERT OR IGNORE INTO anonymous_positions(id,fen,stipulation,created_at)
          SELECT ?,?,?,? WHERE (SELECT COALESCE(MAX(number),0) FROM anonymous_positions)<1000`)
          .bind(publicId, fen, stipulation, createdAt).run();
        const position = await env.DB.prepare(`SELECT id,number,fen,stipulation,created_at AS createdAt
          FROM anonymous_positions WHERE id=?`).bind(publicId).first();
        if (!position) fail('Viešas archyvas pasiekė 1000 pozicijų ribą.', 409);
        return json({ position }, 201);
      }
      await env.DB.prepare(`INSERT INTO saved_positions(id,account_id,position_number,fen,stipulation,created_at)
        SELECT ?,?,COALESCE(MAX(position_number),0)+1,?,?,? FROM saved_positions WHERE account_id=?`)
        .bind(id, user.id, fen, stipulation, createdAt, user.id).run();
      const position = await env.DB.prepare(`SELECT id,position_number AS number,fen,stipulation,created_at AS createdAt
        FROM saved_positions WHERE id=? AND account_id=?`).bind(id, user.id).first();
      return json({ position }, 201);
    }

    const match = new URL(request.url).pathname.match(/^\/api\/positions\/([a-f0-9-]{36})$/i);
    if (request.method === 'DELETE' && match) {
      if (!user) fail('Prisijunkite, kad galėtumėte ištrinti savo poziciją.', 401);
      const result = await env.DB.prepare('DELETE FROM saved_positions WHERE id=? AND account_id=?').bind(match[1], user.id).run();
      if (!result.meta.changes) fail('Uždavinys nerastas.', 404);
      return json({ deleted: true });
    }
    return json({ error: 'Nerasta.' }, 404);
  } catch (error) {
    return json({ error: error.status ? error.message : 'Nepavyko pasiekti uždavinių archyvo.' }, error.status || 503);
  }
}
