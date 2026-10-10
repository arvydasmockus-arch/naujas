import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { GameStore } from './gameStore.mjs';
import { TournamentStore } from './tournamentStore.mjs';
import { tournamentPdf } from './tournamentPdf.mjs';
import { defaultDataDirectory } from './database.mjs';
import { resolve } from 'node:path';
import { staticSite } from './staticSite.mjs';
import { AnalyticsStore } from './analyticsStore.mjs';

const game = new GameStore();
await game.ensureCalendar();
const tournaments = new TournamentStore(game.db);
const judgeKeyPath = resolve(defaultDataDirectory, 'judge-key.txt');
if (!process.env.JUDGE_KEY && !existsSync(judgeKeyPath)) writeFileSync(judgeKeyPath, randomBytes(18).toString('base64url'), { mode: 0o600 });
const judgeKey = (process.env.JUDGE_KEY || readFileSync(judgeKeyPath, 'utf8')).trim();
if (!judgeKey) throw new Error('Judge key must not be empty.');
const analytics = new AnalyticsStore(game.db, judgeKey);
function recordAnalytics(req, event) {
  try { analytics.record({ ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] || '', ...event }); }
  catch (error) { console.error('Analytics event:', error.message); }
}
function isJudge(req) {
  const supplied = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const expected = Buffer.from(judgeKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function weekly() {
  try { tournaments.ensureWeekly(); } catch (error) { console.log('Weekly tournament:', error.message); }
}
weekly();
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' });
const website = production ? staticSite(fileURLToPath(new URL('../dist/', import.meta.url))) : vite.middlewares;
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 160000) throw new Error('Request too large.'); }
  return text ? JSON.parse(text) : {};
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"ok":true}'); return; }
  if (!url.pathname.startsWith('/api/solving/') && !url.pathname.startsWith('/api/tournaments/') && !url.pathname.startsWith('/api/analytics/')) return website(req, res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    let result;
    if (url.pathname.startsWith('/api/analytics/')) {
      if (req.method === 'POST' && url.pathname === '/api/analytics/visit') {
        const data = await body(req);
        recordAnalytics(req, { section: data.section });
        result = { recorded: true };
      } else if (req.method === 'GET' && url.pathname === '/api/analytics/summary') {
        if (!isJudge(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Judge access required.' })); return; }
        result = analytics.summary(url.searchParams.get('days'));
      } else { res.statusCode = 404; result = { error: 'Not found.' }; }
      res.end(JSON.stringify(result)); return;
    }
    if (url.pathname.startsWith('/api/tournaments/')) {
      const action = url.pathname.slice('/api/tournaments/'.length);
      const judge = isJudge(req);
      const privateAction = ['generate', 'settings', 'result', 'delete-result', 'delete', 'replace', 'judge/login'].includes(action);
      if ((privateAction || url.searchParams.get('judge') === '1') && !judge) {
        res.statusCode = 401; res.end(JSON.stringify({ error: 'Judge access required.' })); return;
      }
      if (req.method === 'GET' && action === 'catalog') result = tournaments.list(judge);
      else if (req.method === 'GET' && action === 'event') result = tournaments.get(url.searchParams.get('id'), judge);
      else if (req.method === 'GET' && action === 'pdf') {
        const event = tournaments.get(url.searchParams.get('id'), judge);
        const kind = url.searchParams.get('kind');
        if (kind === 'solutions' && !judge && !event.solutionsPublic) throw new Error('Solutions have not been published.');
        if (kind === 'results' && !judge && !event.resultsPublic) throw new Error('Results have not been published.');
        const pdf = await tournamentPdf(event, kind);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ML-Academy-No-${event.number}-${event.date}-${kind}.pdf"`);
        res.end(pdf); return;
      } else if (req.method === 'POST') {
        const data = await body(req);
        if (action === 'judge/login') result = { authenticated: true };
        else if (action === 'generate') result = tournaments.generate(data);
        else if (action === 'settings') result = tournaments.settings(data.id, data);
        else if (action === 'result') result = tournaments.saveResult(data.tournamentId, data.result);
        else if (action === 'replace') result = tournaments.replaceProblem(data.id, data.ordinal);
        else if (action === 'delete') result = tournaments.deleteTournament(data.id);
        else if (action === 'delete-result') result = tournaments.deleteResult(data.tournamentId, data.resultId);
        else if (action === 'start') {
          result = tournaments.start(data.id, data.name);
          recordAnalytics(req, { section: 'training', action: 'start', mode: tournaments.get(data.id).mode });
        }
        else if (action === 'submit') {
          result = tournaments.submit(data.id, data.sessionId, data.answers);
          recordAnalytics(req, { section: 'training', action: 'submit', mode: tournaments.get(data.id).mode });
        }
      }
      if (!result) { res.statusCode = 404; result = { error: 'Not found.' }; }
      res.end(JSON.stringify(result)); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/solving/leaderboard') result = { rows: game.overallLeaderboard() };
    else if (req.method === 'GET' && url.pathname === '/api/solving/player') {
      const history = game.playerHistory(url.searchParams.get('name') || '');
      if (!history) { res.statusCode = 404; result = { error: 'No solved problems for this player yet.' }; }
      else result = history;
    }
    else if (req.method === 'GET' && url.pathname === '/api/solving/catalog') result = game.catalog(url.searchParams.get('name'));
    else if (req.method === 'GET' && url.pathname === '/api/solving/series') result = await game.series(url.searchParams.get('date'), url.searchParams.get('name'));
    else if (req.method === 'POST' && url.pathname === '/api/solving/start') {
      const data = await body(req); result = await game.start(data.date, data.name, data.ordinal, data.visit);
      recordAnalytics(req, { section: 'solving', action: 'start' });
    } else if (req.method === 'POST' && url.pathname === '/api/solving/answer') {
      const data = await body(req); result = await game.answer(data.date, data.name, data.ordinal, data.move, data.elapsedMs);
      recordAnalytics(req, { section: 'solving', action: 'answer' });
    } else { res.statusCode = 404; result = { error: 'Not found.' }; }
    res.end(JSON.stringify(result));
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); }
});
const port = Number(process.env.PORT || 5174);
let verifier;
function prepareReserve() {
  if (verifier) return;
  verifier = spawn(process.execPath, [fileURLToPath(new URL('../scripts/verify-puzzles.mjs', import.meta.url))],
    { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  verifier.once('exit', () => { verifier = null; });
  verifier.once('error', (error) => { console.error('Reserve verification:', error.message); verifier = null; });
}
server.listen(port, '0.0.0.0', () => {
  prepareReserve();
  console.log(`ML Solving: http://localhost:${port}/?page=solving`);
  for (const list of Object.values(networkInterfaces())) {
    for (const address of list ?? []) if (address.family === 'IPv4' && !address.internal) console.log(`Local network: http://${address.address}:${port}/?page=solving`);
  }
});
server.on('error', async (error) => {
  console.error(error.message); clearInterval(rotate); clearInterval(reserveTimer); clearInterval(weeklyTimer);
  await vite?.close(); game.close(); process.exitCode = 1;
});
const rotate = setInterval(() => game.ensureCalendar().catch((error) => console.error('Daily generation:', error.message)), 60000);
const reserveTimer = setInterval(prepareReserve, 3600000);
const weeklyTimer = setInterval(weekly, 60000);
async function stop() { clearInterval(rotate); clearInterval(reserveTimer); clearInterval(weeklyTimer); verifier?.kill(); await vite?.close(); server.close(); game.close(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
