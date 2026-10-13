import { randomUUID } from 'node:crypto';
import { Chess } from 'chess.js';
import { compactSolution } from './solutionNotation.mjs';
import { sprintStatistics, sprintLeaderboard, sprintPlayerHistory, validateSprintStatisticsDate } from './sprintReview.mjs';
import { normalizePlayer } from './gameStore.mjs';
import { localSprintDate, sampleSprintRows, selectSprintPuzzles, verifySprintPuzzle } from './sprintSelection.mjs';
export { countWrongKeyTries, localSprintDate, sampleSprintRows, selectSprintPuzzles, sprintDifficulty } from './sprintSelection.mjs';

export const SPRINT_DURATION_MS = 20 * 60 * 1000;
const PROBLEM_COUNT = 3;

function parseArray(value, fallback = []) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function publicPuzzles(db, date) {
  return db.prepare('SELECT ordinal,puzzle,pieces,alternative_moves AS alternativeMoves FROM sprint_puzzles WHERE date=? ORDER BY ordinal').all(date)
    .map((row) => {
      const puzzle = JSON.parse(row.puzzle);
      return { ordinal: row.ordinal, id: puzzle.id, fen: puzzle.fen, whiteCount: puzzle.whiteCount, blackCount: puzzle.blackCount,
        pieces: row.pieces, alternativeMoves: row.alternativeMoves, stipulation: '#2' };
    });
}

function rankRows(rows) {
  const ordered = rows.map((row) => ({ ...row, averageSeconds: Number(row.averageSeconds ?? row.elapsedSeconds ?? 0) }))
    .sort((a, b) => b.points - a.points || a.averageSeconds - b.averageSeconds || a.name.localeCompare(b.name));
  return ordered.map((row, index) => ({ ...row, rank: index && row.points === ordered[index - 1].points
    && row.averageSeconds === ordered[index - 1].averageSeconds ? ordered[index - 1].rank : index + 1 }));
}

export class SprintStore {
  constructor(db, clock = () => Date.now(), validate = verifySprintPuzzle) {
    this.db = db;
    this.clock = clock;
    this.validate = validate;
    db.exec('CREATE TABLE IF NOT EXISTS sprint_retired_positions(position_hash TEXT PRIMARY KEY,puzzle_id TEXT NOT NULL,retired_at INTEGER NOT NULL)');
    db.exec('CREATE TABLE IF NOT EXISTS sprint_days (date TEXT PRIMARY KEY, created_at INTEGER NOT NULL);'
      + 'CREATE TABLE IF NOT EXISTS sprint_puzzles (date TEXT NOT NULL REFERENCES sprint_days(date), ordinal INTEGER NOT NULL,'
      + 'puzzle_id TEXT NOT NULL,puzzle TEXT NOT NULL,position_hash TEXT NOT NULL UNIQUE,pieces INTEGER NOT NULL,'
      + 'alternative_moves INTEGER NOT NULL,PRIMARY KEY(date,ordinal));'
      + 'CREATE TABLE IF NOT EXISTS sprint_sessions (id TEXT PRIMARY KEY,date TEXT NOT NULL REFERENCES sprint_days(date),'
      + 'player_id TEXT NOT NULL REFERENCES players(id),name TEXT NOT NULL,started_at INTEGER NOT NULL,submitted_at INTEGER,'
      + 'answers TEXT,scores TEXT,points INTEGER,elapsed_seconds INTEGER,UNIQUE(date,player_id));'
      + 'CREATE INDEX IF NOT EXISTS sprint_sessions_date ON sprint_sessions(date,submitted_at);'
      + 'CREATE INDEX IF NOT EXISTS sprint_sessions_player ON sprint_sessions(player_id,submitted_at);');
    const columns = new Set(db.prepare('PRAGMA table_info(sprint_sessions)').all().map((column) => column.name));
    if (!columns.has('problem_seconds')) db.exec('ALTER TABLE sprint_sessions ADD COLUMN problem_seconds TEXT');
  }

  today() { return localSprintDate(this.clock()); }

  calendar(name = '') {
    this.ensureDay();
    const player = name ? normalizePlayer(name) : null;
    return { name: player?.name ?? '',
      dates: this.db.prepare('SELECT date FROM sprint_days WHERE date<=? ORDER BY date DESC').all(this.today()).map((row) => row.date),
      completedDates: player ? this.db.prepare('SELECT date FROM sprint_sessions WHERE player_id=? AND submitted_at IS NOT NULL AND date<=? ORDER BY date DESC')
        .all(player.id, this.today()).map((row) => row.date) : [],
    };
  }

  selectPuzzles(date) {
    const rows = this.db.prepare('SELECT p.id,p.raw,p.puzzle FROM puzzles p WHERE p.eligible=1 AND p.verified>=0 AND p.raw IS NOT NULL '
      + 'AND NOT EXISTS(SELECT 1 FROM sprint_puzzles s WHERE s.puzzle_id=p.id) '
      + 'AND NOT EXISTS(SELECT 1 FROM sprint_retired_positions s WHERE s.puzzle_id=p.id) '
      + 'AND NOT EXISTS(SELECT 1 FROM daily_puzzles d WHERE d.puzzle_id=p.id) '
      + "AND NOT EXISTS(SELECT 1 FROM tournament_problems t WHERE json_extract(t.puzzle,'$.id')=p.id)").all();
    const usedPositions = new Set(this.db.prepare('SELECT position_hash FROM sprint_puzzles UNION SELECT position_hash FROM sprint_retired_positions').all().map((row) => row.position_hash));
    return selectSprintPuzzles(sampleSprintRows(rows, date), date, this.validate, usedPositions);
  }

  ensureDay(date = this.today(), recreate = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z'))
      || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('Invalid tournament date.');
    if (!recreate && this.db.prepare('SELECT value FROM metadata WHERE key=?').get(`sprint_cancelled:${date}`)) return;
    if (this.db.prepare('SELECT COUNT(*) AS n FROM sprint_puzzles WHERE date=?').get(date).n === PROBLEM_COUNT) return;
    const chosen = this.selectPuzzles(date);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (recreate) this.db.prepare('DELETE FROM metadata WHERE key=?').run(`sprint_cancelled:${date}`);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM sprint_puzzles WHERE date=?').get(date).n !== PROBLEM_COUNT) {
        this.db.prepare('INSERT OR IGNORE INTO sprint_days(date,created_at) VALUES(?,?)').run(date, this.clock());
        const save = this.db.prepare('INSERT OR IGNORE INTO sprint_puzzles(date,ordinal,puzzle_id,puzzle,position_hash,pieces,alternative_moves) VALUES(?,?,?,?,?,?,?)');
        chosen.forEach((puzzle, ordinal) => save.run(date, ordinal, puzzle.id, JSON.stringify(puzzle), puzzle.positionHash, puzzle.pieces, puzzle.alternativeMoves));
      }
      if (this.db.prepare('SELECT COUNT(*) AS n FROM sprint_puzzles WHERE date=?').get(date).n !== PROBLEM_COUNT)
        throw new Error('Could not reserve three unique problems for this round.');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  judgeCatalog() {
    return { today: this.today(), rounds: this.db.prepare('SELECT d.date,d.created_at AS revision,COUNT(DISTINCT p.ordinal) AS problems,'
      + 'COUNT(DISTINCT s.id) AS players,COUNT(DISTINCT CASE WHEN s.submitted_at IS NOT NULL THEN s.id END) AS submitted '
      + 'FROM sprint_days d LEFT JOIN sprint_puzzles p ON p.date=d.date LEFT JOIN sprint_sessions s ON s.date=d.date GROUP BY d.date ORDER BY d.date DESC').all(),
    players: this.db.prepare('SELECT player_id AS id,name,COUNT(*) AS rounds,SUM(submitted_at IS NOT NULL) AS submitted,SUM(COALESCE(points,0)) AS points '
      + 'FROM sprint_sessions GROUP BY player_id ORDER BY name COLLATE NOCASE').all() };
  }

  judgeRound(date) {
    const day = this.db.prepare('SELECT created_at AS revision FROM sprint_days WHERE date=?').get(date);
    if (!day) throw new Error('Tournament not found.');
    const reviews = this.reviewPuzzles(date);
    return { date, revision: day.revision, puzzles: publicPuzzles(this.db, date).map((puzzle, index) => ({ ...puzzle, ...reviews[index] })),
      sessions: this.db.prepare('SELECT id,player_id AS playerId,name,started_at AS startedAt,submitted_at AS submittedAt,points,elapsed_seconds AS elapsedSeconds '
        + 'FROM sprint_sessions WHERE date=? ORDER BY submitted_at DESC,name').all(date), problemStatistics: this.problemStatistics(date, true) };
  }

  generate(date) {
    const existing = this.db.prepare('SELECT date FROM sprint_days WHERE date=?').get(date);
    if (existing) return { date, created: false };
    this.ensureDay(date, true);
    return { date, created: true };
  }

  deleteRound({ date, revision, confirmed }) {
    if (confirmed !== true) throw new Error('Confirm deleting the round and all its results.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const day = this.db.prepare('SELECT created_at FROM sprint_days WHERE date=?').get(date);
      if (!day) throw new Error('Tournament not found.');
      if (day.created_at !== revision) throw new Error('Tournament changed. Refresh the judge workspace.');
      this.db.prepare('INSERT OR IGNORE INTO sprint_retired_positions(position_hash,puzzle_id,retired_at) SELECT position_hash,puzzle_id,? FROM sprint_puzzles WHERE date=?').run(this.clock(), date);
      this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`sprint_cancelled:${date}`, 'true');
      this.db.prepare('DELETE FROM sprint_sessions WHERE date=?').run(date);
      this.db.prepare('DELETE FROM sprint_puzzles WHERE date=?').run(date);
      this.db.prepare('DELETE FROM sprint_days WHERE date=?').run(date);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { deleted: true, date };
  }

  regenerate({ date, revision, resetResults = false }) {
    if (typeof resetResults !== 'boolean') throw new Error('Invalid reset confirmation.');
    const day = this.db.prepare('SELECT created_at FROM sprint_days WHERE date=?').get(date);
    if (!day) throw new Error('Tournament not found.');
    if (revision !== day.created_at) throw new Error('Tournament changed. Refresh the judge workspace.');
    if (!resetResults && this.db.prepare('SELECT COUNT(*) AS n FROM sprint_sessions WHERE date=?').get(date).n)
      throw new Error('Players have already started. Confirm clearing their results before regenerating.');
    const chosen = this.selectPuzzles(date);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT created_at FROM sprint_days WHERE date=?').get(date);
      if (current?.created_at !== revision) throw new Error('Tournament changed. Refresh the judge workspace.');
      if (!resetResults && this.db.prepare('SELECT COUNT(*) AS n FROM sprint_sessions WHERE date=?').get(date).n)
        throw new Error('Players have already started.');
      this.db.prepare('INSERT OR IGNORE INTO sprint_retired_positions(position_hash,puzzle_id,retired_at) SELECT position_hash,puzzle_id,? FROM sprint_puzzles WHERE date=?').run(this.clock(), date);
      this.db.prepare('DELETE FROM sprint_sessions WHERE date=?').run(date);
      this.db.prepare('DELETE FROM sprint_puzzles WHERE date=?').run(date);
      const save = this.db.prepare('INSERT INTO sprint_puzzles(date,ordinal,puzzle_id,puzzle,position_hash,pieces,alternative_moves) VALUES(?,?,?,?,?,?,?)');
      chosen.forEach((puzzle, ordinal) => save.run(date, ordinal, puzzle.id, JSON.stringify(puzzle), puzzle.positionHash, puzzle.pieces, puzzle.alternativeMoves));
      this.db.prepare('UPDATE sprint_days SET created_at=? WHERE date=?').run(Math.max(this.clock(), revision + 1), date);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.judgeRound(date);
  }

  deleteSession(id) {
    const changes = this.db.prepare('DELETE FROM sprint_sessions WHERE id=?').run(id).changes;
    if (!changes) throw new Error('Player result not found.');
    return { deleted: changes };
  }

  deletePlayer(playerId) {
    if (typeof playerId !== 'string' || !playerId) throw new Error('Invalid player.');
    return { deleted: this.db.prepare('DELETE FROM sprint_sessions WHERE player_id=?').run(playerId).changes };
  }

  restore(name, date) {
    const player = normalizePlayer(name);
    const session = this.db.prepare('SELECT * FROM sprint_sessions WHERE date=? AND player_id=?').get(date, player.id);
    return session ? { ...this.sessionView(session, date), puzzles: publicPuzzles(this.db, date) } : { session: null };
  }

  dailyLeaderboard(date) {
    const rows = this.db.prepare('SELECT name,points,elapsed_seconds AS elapsedSeconds,answers,scores,problem_seconds AS problemSeconds FROM sprint_sessions '
      + 'WHERE date=? AND submitted_at IS NOT NULL ORDER BY points DESC,elapsed_seconds,name').all(date);
    return rankRows(rows.map(({ answers, scores, problemSeconds, ...row }) => ({ ...row, results: parseArray(scores).map((correct, index) => ({
      correct: Boolean(correct), answered: Boolean(parseArray(answers)[index]?.trim()),
      seconds: parseArray(problemSeconds)[index] ?? row.elapsedSeconds,
    })) })));
  }

  problemStatistics(date, includeMoves = false) {
    const rows = this.db.prepare('SELECT name,answers,scores,problem_seconds AS problemSeconds,elapsed_seconds AS elapsedSeconds FROM sprint_sessions '
      + 'WHERE date=? AND submitted_at IS NOT NULL').all(date);
    const puzzles = this.db.prepare('SELECT puzzle FROM sprint_puzzles WHERE date=? ORDER BY ordinal').all(date).map((row) => JSON.parse(row.puzzle));
    return sprintStatistics(rows, puzzles, includeMoves);
  }

  overallLeaderboard() {
    return rankRows(this.db.prepare('SELECT player_id AS id,name,SUM(points) AS points,COUNT(*) AS rounds,'
      + 'AVG(elapsed_seconds) AS averageSeconds FROM sprint_sessions WHERE submitted_at IS NOT NULL GROUP BY player_id ORDER BY points DESC').all());
  }

  statisticsLeaderboard(date = '') {
    validateSprintStatisticsDate(date);
    const query = this.db.prepare('SELECT player_id AS playerId,name,answers,scores,problem_seconds AS problemSeconds,elapsed_seconds AS elapsedSeconds FROM sprint_sessions WHERE submitted_at IS NOT NULL'
      + (date ? ' AND date=?' : ''));
    return sprintLeaderboard(date ? query.all(date) : query.all(), Boolean(date));
  }

  playerHistory(name) {
    const player = normalizePlayer(name);
    return sprintPlayerHistory(this.db.prepare('SELECT date,answers,scores,problem_seconds AS problemSeconds,elapsed_seconds AS elapsedSeconds FROM sprint_sessions WHERE player_id=? AND submitted_at IS NOT NULL ORDER BY date DESC').all(player.id));
  }

  dailyWinners() {
    const rows = this.db.prepare('SELECT date,name,points,elapsed_seconds AS elapsedSeconds FROM sprint_sessions '
      + 'WHERE submitted_at IS NOT NULL ORDER BY date DESC,points DESC,elapsed_seconds,name').all();
    const winners = new Map();
    for (const row of rows) if (!winners.has(row.date)) winners.set(row.date, row);
    return [...winners.values()].slice(0, 30);
  }

  round(date, sessionId) {
    this.ensureDay();
    date ??= this.db.prepare('SELECT date FROM sprint_days WHERE date<=? ORDER BY date DESC LIMIT 1').get(this.today())?.date ?? this.today();
    if (date > this.today()) throw new Error('This tournament is not available yet.');
    if (date !== this.today() && !this.db.prepare('SELECT date FROM sprint_days WHERE date=?').get(date))
      throw new Error('Tournament not found.');
    this.ensureDay(date);
    if (!this.db.prepare('SELECT date FROM sprint_days WHERE date=?').get(date)) throw new Error('Tournament not found.');
    const requested = sessionId && this.db.prepare('SELECT submitted_at FROM sprint_sessions WHERE id=? AND date=?').get(sessionId, date);
    const completed = requested && requested.submitted_at !== null;
    return { date, dates: this.db.prepare('SELECT date FROM sprint_days WHERE date<=? ORDER BY date DESC').all(this.today()).map((row) => row.date), durationSeconds: SPRINT_DURATION_MS / 1000, puzzles: publicPuzzles(this.db, date),
      dailyResults: this.dailyLeaderboard(date), overallResults: this.overallLeaderboard(), dailyWinners: this.dailyWinners(),
      problemStatistics: this.problemStatistics(date, Boolean(completed)),
      ...(sessionId ? { sessionStatus: requested ? requested.submitted_at === null ? 'active' : 'submitted' : 'missing' } : {}), serverNow: this.clock() };
  }

  reviewPuzzles(date) {
    return this.db.prepare('SELECT ordinal,puzzle FROM sprint_puzzles WHERE date=? ORDER BY ordinal').all(date).map((row) => {
      const puzzle = JSON.parse(row.puzzle);
      const chess = new Chess(puzzle.fen);
      const keySan = chess.move(puzzle.key).san;
      return { ordinal: row.ordinal, keySan, solution: compactSolution(puzzle), source: puzzle.source, year: puzzle.year,
        authors: puzzle.authors, sourceUrl: puzzle.sourceUrl };
    });
  }

  sessionView(session, date) {
    return { id: session.id, date, name: session.name, startedAt: session.started_at,
      deadline: session.started_at + SPRINT_DURATION_MS, submittedAt: session.submitted_at,
      ...(session.submitted_at === null ? {} : { answers: JSON.parse(session.answers), scores: JSON.parse(session.scores),
        problemSeconds: parseArray(session.problem_seconds), points: session.points, elapsedSeconds: session.elapsed_seconds,
        reviewPuzzles: this.reviewPuzzles(date), problemStatistics: this.problemStatistics(date, true) }), serverNow: this.clock() };
  }

  start(name, date = this.today()) {
    if (date > this.today()) throw new Error('This tournament is not available yet.');
    if (date !== this.today() && !this.db.prepare('SELECT date FROM sprint_days WHERE date=?').get(date))
      throw new Error('Tournament not found.');
    this.ensureDay(date);
    if (!this.db.prepare('SELECT date FROM sprint_days WHERE date=?').get(date)) throw new Error('Tournament not found.');
    const player = normalizePlayer(name);
    this.db.prepare('INSERT OR IGNORE INTO players(id,name) VALUES(?,?)').run(player.id, player.name);
    this.db.prepare('INSERT OR IGNORE INTO sprint_sessions(id,date,player_id,name,started_at) VALUES(?,?,?,?,?)')
      .run(randomUUID(), date, player.id, player.name, this.clock());
    const session = this.db.prepare('SELECT * FROM sprint_sessions WHERE date=? AND player_id=?').get(date, player.id);
    return { ...this.sessionView(session, date), puzzles: publicPuzzles(this.db, date) };
  }

  submit(sessionId, answers, requestedProblemSeconds = []) {
    const session = this.db.prepare('SELECT * FROM sprint_sessions WHERE id=?').get(sessionId);
    if (!session) throw new Error('Start today’s tournament first.');
    if (!Array.isArray(answers) || answers.length !== PROBLEM_COUNT
      || answers.some((answer) => typeof answer !== 'string' || answer.length > 100)) throw new Error('Enter up to three answers.');
    if (session.submitted_at !== null) return this.sessionView(session, session.date);
    const storedPuzzles = this.db.prepare('SELECT puzzle FROM sprint_puzzles WHERE date=? ORDER BY ordinal').all(session.date)
      .map((row) => JSON.parse(row.puzzle));
    const scores = answers.map((answer, index) => {
      if (!answer.trim()) return 0;
      const chess = new Chess(storedPuzzles[index].fen);
      let move;
      try { move = chess.move(answer.trim().replace(/[!?]+$/g, '')); } catch { return 0; }
      return Number(move.lan === storedPuzzles[index].key);
    });
    const submittedAt = this.clock();
    const elapsedSeconds = Math.min(SPRINT_DURATION_MS / 1000, Math.max(0, Math.floor((submittedAt - session.started_at) / 1000)));
    const problemSeconds = Array.from({ length: PROBLEM_COUNT }, (_, index) => {
      const value = Number(requestedProblemSeconds[index]);
      return answers[index].trim() && Number.isFinite(value) && value >= 0
        ? Math.min(elapsedSeconds, Math.floor(value)) : elapsedSeconds;
    });
    this.db.prepare('UPDATE sprint_sessions SET submitted_at=?,answers=?,scores=?,problem_seconds=?,points=?,elapsed_seconds=? WHERE id=? AND submitted_at IS NULL')
      .run(submittedAt, JSON.stringify(answers), JSON.stringify(scores), JSON.stringify(problemSeconds),
        scores.reduce((sum, score) => sum + score, 0), elapsedSeconds, sessionId);
    const saved = this.db.prepare('SELECT * FROM sprint_sessions WHERE id=?').get(sessionId);
    return this.sessionView(saved, session.date);
  }
}
