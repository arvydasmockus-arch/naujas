import { createHash, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Chess } from 'chess.js';
import { openDatabase, getMetadata } from './database.mjs';

export function utcDay(now = new Date()) { return now.toISOString().slice(0, 10); }
export function calendarDays(today = utcDay()) {
  return Array.from({ length: 30 }, (_, index) => new Date(Date.parse(`${today}T12:00:00Z`) - index * 86400000).toISOString().slice(0, 10));
}
export function normalizePlayer(name) {
  if (typeof name !== 'string') throw new Error('Enter a player name.');
  const clean = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 40 || /[\u0000-\u001f\u007f]/.test(clean)) throw new Error('Player names must contain 2–40 characters.');
  return { id: createHash('sha256').update(clean.toLocaleLowerCase('en-US')).digest('hex'), name: clean };
}
function verifyInWorker(puzzle) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./verifyWorker.mjs', import.meta.url), { workerData: puzzle });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Puzzle verification timed out')); }, 90000);
    worker.once('message', (valid) => { clearTimeout(timer); resolve(valid); });
    worker.once('error', (error) => { clearTimeout(timer); reject(error); });
    worker.once('exit', (code) => { if (code !== 0) { clearTimeout(timer); reject(new Error('Puzzle verifier stopped')); } });
  });
}

export class GameStore {
  constructor(path, clock = () => Date.now()) {
    this.db = openDatabase(path);
    this.clock = clock;
    this.queue = Promise.resolve();
  }
  today() { return utcDay(new Date(this.clock())); }
  available(date) { return calendarDays(this.today()).includes(date); }
  player(name) {
    const player = normalizePlayer(name);
    this.db.prepare('INSERT OR IGNORE INTO players(id,name) VALUES(?,?)').run(player.id, player.name);
    return this.db.prepare('SELECT id,name FROM players WHERE id=?').get(player.id);
  }
  ensureDay(date) {
    const task = this.queue.then(() => this.allocateDay(date));
    this.queue = task.catch(() => {});
    return task;
  }
  async allocateDay(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date.');
    if (this.db.prepare('SELECT COUNT(*) AS n FROM daily_puzzles WHERE date=?').get(date).n === 6) return;
    if (!this.available(date)) throw new Error('This series is closed.');
    const chosen = [];
    const hashes = new Set();
    while (chosen.length < 6) {
      const rows = this.db.prepare(`SELECT id,puzzle,position_hash,verified FROM puzzles p
        WHERE eligible=1 AND verified>=0 AND position_hash IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.position_hash=p.position_hash)
        ORDER BY verified DESC, RANDOM() LIMIT 24`).all();
      if (!rows.length) throw new Error('No unused verified puzzles available. Continue the puzzle import.');
      let added = false;
      for (const row of rows) {
        if (hashes.has(row.position_hash)) continue;
        const puzzle = JSON.parse(row.puzzle);
        let valid = row.verified === 1;
        if (!valid) {
          try { valid = await verifyInWorker(puzzle); }
          catch { valid = false; }
          this.db.prepare('UPDATE puzzles SET verified=? WHERE id=?').run(valid ? 1 : -1, row.id);
        }
        if (!valid) continue;
        chosen.push(row); hashes.add(row.position_hash); added = true;
        if (chosen.length === 6) break;
      }
      if (!added && rows.every((row) => hashes.has(row.position_hash))) throw new Error('Not enough distinct unused positions.');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO daily(date,created_at) VALUES(?,?)').run(date, this.clock());
      const add = this.db.prepare('INSERT INTO daily_puzzles(date,ordinal,puzzle_id,position_hash) VALUES(?,?,?,?)');
      chosen.forEach((row, ordinal) => add.run(date, ordinal, row.id, row.position_hash));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async ensureCalendar() {
    // The shared series is pinned permanently, regardless of later imports.
    for (const date of calendarDays(this.today()).reverse()) await this.ensureDay(date);
  }
  library() {
    return { ...this.db.prepare(`SELECT COUNT(*) AS total, SUM(raw IS NOT NULL) AS imported,
      SUM(eligible=1) AS eligible, SUM(verified=1) AS verified FROM puzzles`).get(),
      expected: getMetadata(this.db, 'import_expected', 217611),
      importStatus: getMetadata(this.db, 'import_status', {}) };
  }
  catalog(name) {
    const player = name ? this.player(name) : null;
    const days = calendarDays(this.today()).map((date) => {
      const answers = player ? this.db.prepare('SELECT correct FROM attempts WHERE date=? AND player_id=? AND answered_at IS NOT NULL').all(date, player.id) : [];
      return { date, answered: answers.length, points: answers.filter((row) => row.correct).length,
        players: this.db.prepare('SELECT COUNT(DISTINCT player_id) AS n FROM attempts WHERE date=?').get(date).n };
    });
    return { days, today: this.today(), timezone: 'UTC', library: this.library(), serverNow: this.clock() };
  }
  puzzles(date) {
    return this.db.prepare(`SELECT p.puzzle FROM daily_puzzles d JOIN puzzles p ON p.id=d.puzzle_id WHERE date=? ORDER BY ordinal`).all(date).map((row) => JSON.parse(row.puzzle));
  }
  async series(date, name) {
    if (this.available(date)) await this.ensureDay(date);
    const puzzles = this.puzzles(date);
    if (puzzles.length !== 6) throw new Error('Series not found.');
    const player = this.player(name);
    const attempts = this.db.prepare('SELECT * FROM attempts WHERE date=? AND player_id=? ORDER BY ordinal').all(date, player.id);
    const results = attempts.filter((row) => row.answered_at !== null).map((row) => ({
      ordinal: row.ordinal, move: row.move, san: row.san, correct: Boolean(row.correct), seconds: row.seconds, reopened: row.reopens > 0,
    }));
    const current = attempts.find((row) => row.answered_at === null);
    const finished = results.length === 6;
    const canReview = finished || !this.available(date);
    return { date, player: player.name, playerId: player.id, available: this.available(date), results,
      startedAt: current?.started_at ?? null, finished, canReview, serverNow: this.clock(),
      puzzles: puzzles.map((puzzle, ordinal) => canReview ? { ...puzzle, ordinal } : { id: puzzle.id, fen: puzzle.fen, ordinal }),
      ...this.overall(date, canReview) };
  }
  async start(date, name, ordinal, visit = randomUUID()) {
    if (!this.available(date)) throw new Error('This series is closed.');
    await this.ensureDay(date);
    const player = this.player(name);
    const completed = this.db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE date=? AND player_id=? AND answered_at IS NOT NULL').get(date, player.id).n;
    if (!Number.isInteger(ordinal) || ordinal !== completed || ordinal >= 6) throw new Error('Refresh the series before continuing.');
    const existing = this.db.prepare('SELECT * FROM attempts WHERE date=? AND player_id=? AND ordinal=?').get(date, player.id, ordinal);
    if (!existing) this.db.prepare('INSERT INTO attempts(player_id,date,ordinal,started_at) VALUES(?,?,?,?)').run(player.id, date, ordinal, this.clock());
    // A visit token avoids double-counting React StrictMode request retries.
    const tokenKey = `visit:${player.id}:${date}:${ordinal}`;
    const previous = getMetadata(this.db, tokenKey);
    if (existing && previous && previous !== visit) this.db.prepare('UPDATE attempts SET reopens=reopens+1 WHERE player_id=? AND date=? AND ordinal=?').run(player.id, date, ordinal);
    this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(tokenKey, JSON.stringify(visit));
    return this.series(date, name);
  }
  async answer(date, name, ordinal, move, elapsedMs) {
    if (!this.available(date)) throw new Error('This series is closed.');
    const player = this.player(name);
    const attempt = this.db.prepare('SELECT * FROM attempts WHERE player_id=? AND date=? AND ordinal=?').get(player.id, date, ordinal);
    if (!attempt) throw new Error('Open the diagram before submitting a move.');
    if (attempt.answered_at !== null) return this.series(date, name);
    const puzzle = this.puzzles(date)[ordinal];
    if (!puzzle) throw new Error('Invalid problem number.');
    let san = null, lan = null;
    if (move !== null) {
      if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error('Invalid move.');
      const chess = new Chess(puzzle.fen);
      try { const played = chess.move(move); san = played.san; lan = played.lan; }
      catch { throw new Error('Illegal move.'); }
    }
    const serverElapsed = Math.max(0, this.clock() - attempt.started_at);
    const measured = Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= serverElapsed + 3000 ? elapsedMs : serverElapsed;
    this.db.prepare(`UPDATE attempts SET answered_at=?,seconds=?,move=?,san=?,correct=?
      WHERE player_id=? AND date=? AND ordinal=? AND answered_at IS NULL`).run(this.clock(), Math.floor(measured / 1000), lan, san,
        Number(lan === puzzle.key), player.id, date, ordinal);
    return this.series(date, name);
  }
  overall(date, includeStatistics = false) {
    const attempts = this.db.prepare(`SELECT a.*,p.name FROM attempts a JOIN players p ON p.id=a.player_id WHERE a.date=? ORDER BY a.ordinal`).all(date);
    const groups = new Map();
    for (const row of attempts) {
      if (!groups.has(row.player_id)) groups.set(row.player_id, { id: row.player_id, name: row.name, results: Array(6).fill(null), points: 0, seconds: 0, answered: 0 });
      if (row.answered_at === null) continue;
      const group = groups.get(row.player_id);
      group.results[row.ordinal] = { correct: Boolean(row.correct), seconds: row.seconds, reopened: row.reopens > 0 };
      group.points += Number(row.correct); group.seconds += row.seconds; group.answered++;
    }
    const leaderboard = [...groups.values()].sort((a, b) => b.points - a.points || a.seconds - b.seconds || a.name.localeCompare(b.name));
    const statistics = includeStatistics ? Array.from({ length: 6 }, (_, ordinal) => {
      const rows = attempts.filter((row) => row.ordinal === ordinal && row.answered_at !== null);
      const correct = rows.filter((row) => row.correct);
      const skipped = rows.filter((row) => row.move === null);
      const wrong = new Map();
      for (const row of rows.filter((row) => !row.correct && row.move !== null)) {
        const value = wrong.get(row.san) ?? { san: row.san, count: 0, seconds: 0 };
        value.count++; value.seconds += row.seconds; wrong.set(row.san, value);
      }
      return { ordinal, answered: rows.length, solved: correct.length, failed: rows.length - correct.length,
        skipped: skipped.length, averageSeconds: rows.length ? rows.reduce((sum, row) => sum + row.seconds, 0) / rows.length : null,
        averageCorrectSeconds: correct.length ? correct.reduce((sum, row) => sum + row.seconds, 0) / correct.length : null,
        wrongMoves: [...wrong.values()].map((item) => ({ ...item, averageSeconds: item.seconds / item.count })).sort((a, b) => b.count - a.count) };
    }) : [];
    return { leaderboard, statistics };
  }
  close() { this.db.close(); }
}
