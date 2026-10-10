import { randomUUID } from 'node:crypto';
import { tournamentTypes, latestSaturday, rankResults, oldEnough, parseTournamentEntry } from './tournamentTools.mjs';
import { normalizePlayer } from './gameStore.mjs';
import { solutionDraft } from './solutionDraft.mjs';
const defaultTitle = 'Solving tournament of Martynas Limontas';
function namedEvent(row) { return { ...row, displayTitle: `${row.title} No. ${row.number} — ${row.date.replaceAll('-', '.')}` }; }

export class TournamentStore {
  constructor(db, clock = () => Date.now()) {
    this.db = db; this.clock = clock;
    db.exec(`CREATE TABLE IF NOT EXISTS tournament_pool(id TEXT PRIMARY KEY,type TEXT NOT NULL,raw TEXT NOT NULL,
      puzzle TEXT NOT NULL,position_hash TEXT NOT NULL,checked_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tournament_pool_type ON tournament_pool(type);
      CREATE TABLE IF NOT EXISTS tournaments(id TEXT PRIMARY KEY,title TEXT NOT NULL,date TEXT NOT NULL,
        mode TEXT NOT NULL,status TEXT NOT NULL,solutions_public INTEGER NOT NULL DEFAULT 0,
        results_public INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,weekly INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS tournament_week ON tournaments(date) WHERE weekly=1;
      CREATE TABLE IF NOT EXISTS tournament_problems(tournament_id TEXT NOT NULL REFERENCES tournaments(id),
        ordinal INTEGER NOT NULL,puzzle TEXT NOT NULL,position_hash TEXT NOT NULL UNIQUE,
        scoring_notes TEXT NOT NULL DEFAULT '',PRIMARY KEY(tournament_id,ordinal));
      CREATE TABLE IF NOT EXISTS tournament_sessions(id TEXT PRIMARY KEY,tournament_id TEXT NOT NULL REFERENCES tournaments(id),
        player_id TEXT NOT NULL,name TEXT NOT NULL,started_at INTEGER NOT NULL,submitted_at INTEGER,answers TEXT,
        UNIQUE(tournament_id,player_id));
      CREATE TABLE IF NOT EXISTS tournament_results(id TEXT PRIMARY KEY,tournament_id TEXT NOT NULL REFERENCES tournaments(id),
        name TEXT NOT NULL,country TEXT NOT NULL,category TEXT NOT NULL,rating TEXT NOT NULL,title TEXT NOT NULL,
        scores TEXT NOT NULL,minutes REAL NOT NULL,notes TEXT NOT NULL DEFAULT '');`);
    if (!db.prepare('PRAGMA table_info(tournaments)').all().some((column) => column.name === 'number')) {
      db.exec('ALTER TABLE tournaments ADD COLUMN number INTEGER');
    }
    if (!db.prepare('PRAGMA table_info(tournament_problems)').all().some((column) => column.name === 'solution_draft'))
      db.exec("ALTER TABLE tournament_problems ADD COLUMN solution_draft TEXT NOT NULL DEFAULT ''");
    db.exec('BEGIN IMMEDIATE');
    try {
      let next = (db.prepare('SELECT MAX(number) AS n FROM tournaments').get().n ?? 0) + 1;
      for (const row of db.prepare('SELECT id,title,date FROM tournaments WHERE number IS NULL ORDER BY created_at,id').all()) {
        db.prepare('UPDATE tournaments SET number=?,title=? WHERE id=?').run(next++, row.title === `ML Academy · ${row.date}` ? defaultTitle : row.title, row.id);
      }
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS tournament_number ON tournaments(number)');
      const saved = db.prepare("SELECT value FROM metadata WHERE key='tournament_next_number'").get();
      next = Math.max(next, saved ? JSON.parse(saved.value) : 1);
      db.prepare("INSERT INTO metadata(key,value) VALUES('tournament_next_number',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  pool() { return this.db.prepare('SELECT type,COUNT(*) AS count FROM tournament_pool GROUP BY type').all(); }
  eligible(candidate) {
    const puzzle = JSON.parse(candidate.puzzle);
    const raw = this.db.prepare('SELECT raw,checked_at FROM tournament_pool WHERE id=?').get(puzzle.id);
    return raw && parseTournamentEntry(JSON.parse(raw.raw), raw.checked_at) !== null;
  }
  generate({ mode = 'training', title = '', date = latestSaturday(this.clock()), weekly = false } = {}) {
    if (!['training', 'competition'].includes(mode)) throw new Error('Invalid tournament mode.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Invalid date.');
    const selected = []; const hashes = new Set();
    for (const type of tournamentTypes) {
      const rows = this.db.prepare(`SELECT puzzle,position_hash FROM tournament_pool p WHERE type=?
        AND NOT EXISTS(SELECT 1 FROM tournament_problems t WHERE t.position_hash=p.position_hash) ORDER BY RANDOM()`).all(type);
      const unused = rows.filter((candidate) => !hashes.has(candidate.position_hash) && oldEnough(JSON.parse(candidate.puzzle).publicationDate, date)
        && this.eligible(candidate));
      const size = (candidate) => { const puzzle = JSON.parse(candidate.puzzle); return puzzle.whiteCount + puzzle.blackCount; };
      const densityMatters = ['#2', '#3', '#n', 's#n'].includes(type);
      const row = densityMatters ? unused.find((candidate) => size(candidate) >= 20 && size(candidate) <= 25)
        ?? unused.find((candidate) => size(candidate) > 15) : unused[0];
      if (!row) throw new Error(`No unused ${type} candidates. Run npm run import:tournaments.`);
      selected.push(JSON.parse(row.puzzle)); hashes.add(row.position_hash);
    }
    if (selected.filter((puzzle) => puzzle.whiteCount + puzzle.blackCount > 15).length < 4)
      throw new Error('Not enough dense positions: at least 4 of 6 problems must have more than 15 pieces. Extend the pool.');
    const id = randomUUID();
    const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 140) : '';
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const number = JSON.parse(this.db.prepare("SELECT value FROM metadata WHERE key='tournament_next_number'").get().value);
      this.db.prepare('INSERT INTO tournaments(id,title,date,mode,status,created_at,weekly,number) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, cleanTitle || defaultTitle, date, mode, mode === 'training' ? 'published' : 'draft', this.clock(), Number(weekly), number);
      this.db.prepare("UPDATE metadata SET value=? WHERE key='tournament_next_number'").run(JSON.stringify(number + 1));
      const save = this.db.prepare('INSERT INTO tournament_problems(tournament_id,ordinal,puzzle,position_hash) VALUES(?,?,?,?)');
      selected.forEach((puzzle, index) => save.run(id, index, JSON.stringify(puzzle), puzzle.positionHash));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.get(id, true);
  }
  ensureWeekly() {
    const date = latestSaturday(this.clock());
    if (this.db.prepare('SELECT value FROM metadata WHERE key=?').get(`weekly_cancelled:${date}`)) return;
    if (this.db.prepare("SELECT id FROM tournaments WHERE (date=? AND weekly=1) OR (date>=? AND mode='training')").get(date, date)) return;
    this.generate({ date, weekly: true, mode: 'training' });
  }
  list(judge = false) {
    return { tournaments: this.db.prepare(`SELECT id,number,title,date,mode,status,solutions_public AS solutionsPublic,
      results_public AS resultsPublic FROM tournaments ${judge ? '' : "WHERE status='published'"} ORDER BY date DESC,created_at DESC`).all().map(namedEvent),
      pool: judge ? this.pool() : undefined, timezone: 'Europe/Vilnius', weeklyHour: 10, serverNow: this.clock() };
  }
  get(id, judge = false) {
    const row = this.db.prepare('SELECT * FROM tournaments WHERE id=?').get(id);
    if (!row || (!judge && row.status !== 'published')) throw new Error('Tournament not found.');
    const showSolutions = judge || Boolean(row.solutions_public);
    const stored = this.db.prepare('SELECT * FROM tournament_problems WHERE tournament_id=? ORDER BY ordinal').all(id);
    const puzzles = stored.map((item) => {
      const puzzle = JSON.parse(item.puzzle);
      const draft = showSolutions ? solutionDraft(puzzle) : null;
      return showSolutions ? { ...puzzle, ordinal: item.ordinal, scoringNotes: item.scoring_notes,
        solutionDraft: item.solution_draft || draft.text, draftWarnings: judge && !item.solution_draft ? draft.warnings : [] } : {
        ordinal: item.ordinal, fen: puzzle.fen, type: puzzle.type, stipulation: puzzle.stipulation,
        solutions: puzzle.solutions, whiteCount: puzzle.whiteCount, blackCount: puzzle.blackCount };
    });
    const results = judge || row.results_public ? rankResults(this.db.prepare('SELECT * FROM tournament_results WHERE tournament_id=?').all(id)
      .map((item) => {
        const parsed = { ...item, scores: JSON.parse(item.scores) };
        if (!judge) delete parsed.notes;
        return parsed;
      })) : [];
    const submissions = judge ? this.db.prepare('SELECT * FROM tournament_sessions WHERE tournament_id=? AND submitted_at IS NOT NULL ORDER BY submitted_at').all(id)
      .map((item) => ({ ...item, answers: JSON.parse(item.answers), minutes: Math.min(120, (item.submitted_at - item.started_at) / 60000) })) : undefined;
    return { id, number: row.number, title: row.title, displayTitle: namedEvent(row).displayTitle, date: row.date, mode: row.mode, status: row.status,
      solutionsPublic: Boolean(row.solutions_public), resultsPublic: Boolean(row.results_public),
      durationMinutes: 120, puzzles, results, submissions, serverNow: this.clock() };
  }
  settings(id, data) {
    const event = this.get(id, true);
    if (data.title !== undefined && (!data.title.trim() || data.title.length > 140)) throw new Error('Enter a title (max. 140 characters).');
    if (data.status !== undefined && !['draft', 'published'].includes(data.status)) throw new Error('Invalid status.');
    if (event.mode === 'competition' && data.status === 'published' && event.status !== 'published' && !data.judgeReviewed)
      throw new Error('Review the solutions, difficulty and scoring before publishing a competition.');
    if (data.scoringNotes && (!Array.isArray(data.scoringNotes) || data.scoringNotes.length !== 6 || data.scoringNotes.some((note) => typeof note !== 'string' || note.length > 4000))) throw new Error('Invalid scoring notes.');
    if (data.solutionDrafts && (!Array.isArray(data.solutionDrafts) || data.solutionDrafts.length !== 6 || data.solutionDrafts.some((draft) => typeof draft !== 'string' || draft.length > 20000
      || [...draft.matchAll(/\[(\d+(?:[.,]\d+)?)\]/g)].some((match) => Number(match[1].replace(',', '.')) > 5)))) throw new Error('Invalid solution draft or score (maximum 5).');
    this.db.prepare('UPDATE tournaments SET title=?,status=?,solutions_public=?,results_public=? WHERE id=?')
      .run(data.title?.trim() ?? event.title, data.status ?? event.status,
        Number(data.solutionsPublic ?? event.solutionsPublic), Number(data.resultsPublic ?? event.resultsPublic), id);
    if (data.scoringNotes) {
      if (!Array.isArray(data.scoringNotes) || data.scoringNotes.length !== 6 || data.scoringNotes.some((note) => typeof note !== 'string' || note.length > 4000)) throw new Error('Invalid scoring notes.');
      const save = this.db.prepare('UPDATE tournament_problems SET scoring_notes=? WHERE tournament_id=? AND ordinal=?');
      data.scoringNotes.forEach((note, ordinal) => save.run(note, id, ordinal));
    }
    if (data.solutionDrafts) {
      const save = this.db.prepare('UPDATE tournament_problems SET solution_draft=? WHERE tournament_id=? AND ordinal=?');
      data.solutionDrafts.forEach((draft, ordinal) => save.run(draft, id, ordinal));
    }
    return this.get(id, true);
  }
  saveResult(id, data) {
    this.get(id, true);
    const player = normalizePlayer(data.name);
    if (!Array.isArray(data.scores) || data.scores.length !== 6 || data.scores.some((score) => score !== null &&
      (!Number.isFinite(score) || score < 0 || score > 5))) throw new Error('Each score must be between 0 and 5.');
    if (!Number.isFinite(data.minutes) || data.minutes < 0 || data.minutes > 120) throw new Error('Time must be between 0 and 120 minutes.');
    const resultId = data.id || randomUUID();
    if (data.id && !this.db.prepare('SELECT id FROM tournament_results WHERE id=? AND tournament_id=?').get(data.id, id)) throw new Error('Result not found.');
    const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    this.db.prepare(`INSERT INTO tournament_results VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,country=excluded.country,category=excluded.category,rating=excluded.rating,title=excluded.title,
      scores=excluded.scores,minutes=excluded.minutes,notes=excluded.notes`)
      .run(resultId, id, player.name, text(data.country, 3).toUpperCase(), text(data.category, 12), text(data.rating, 16), text(data.title, 16),
        JSON.stringify(data.scores), data.minutes, text(data.notes, 2000));
    return this.get(id, true);
  }
  replaceProblem(id, ordinal) {
    const event = this.get(id, true);
    if (this.db.prepare('SELECT COUNT(*) AS n FROM tournament_sessions WHERE tournament_id=?').get(id).n
      || this.db.prepare('SELECT COUNT(*) AS n FROM tournament_results WHERE tournament_id=?').get(id).n)
      throw new Error('Problems cannot be replaced after a player has started or results have been recorded.');
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= 6) throw new Error('Invalid problem number.');
    const type = tournamentTypes[ordinal];
    const candidates = this.db.prepare(`SELECT puzzle,position_hash FROM tournament_pool p WHERE type=?
      AND NOT EXISTS(SELECT 1 FROM tournament_problems t WHERE t.position_hash=p.position_hash) ORDER BY RANDOM()`).all(type);
    const count = (row) => { const p = JSON.parse(row.puzzle); return p.whiteCount + p.blackCount; };
    const densityMatters = ['#2', '#3', '#n', 's#n'].includes(type);
    const eligible = candidates.filter((row) => oldEnough(JSON.parse(row.puzzle).publicationDate, event.date) && this.eligible(row));
    const ordered = densityMatters ? [...eligible.filter((row) => count(row) >= 20 && count(row) <= 25),
      ...eligible.filter((row) => count(row) > 15)] : eligible;
    const otherDense = event.puzzles.filter((puzzle, index) => index !== ordinal && puzzle.whiteCount + puzzle.blackCount > 15).length;
    const chosen = ordered.find((row) => otherDense + Number(count(row) > 15) >= 4);
    if (!chosen) throw new Error('No unused candidate matching the density requirement.');
    this.db.prepare('UPDATE tournament_problems SET puzzle=?,position_hash=?,scoring_notes=?,solution_draft=? WHERE tournament_id=? AND ordinal=?')
      .run(chosen.puzzle, chosen.position_hash, '', '', id, ordinal);
    return this.get(id, true);
  }
  deleteTournament(id) {
    const event = this.db.prepare('SELECT id,date,mode FROM tournaments WHERE id=?').get(id);
    if (!event) throw new Error('Tournament not found.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM tournament_sessions WHERE tournament_id=?').run(id);
      this.db.prepare('DELETE FROM tournament_results WHERE tournament_id=?').run(id);
      this.db.prepare('DELETE FROM tournament_problems WHERE tournament_id=?').run(id);
      this.db.prepare('DELETE FROM tournaments WHERE id=?').run(id);
      if (event.mode === 'training' && event.date === latestSaturday(this.clock())) {
        this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
          .run(`weekly_cancelled:${event.date}`, JSON.stringify(true));
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { deleted: true, id };
  }
  deleteResult(id, resultId) {
    this.get(id, true);
    this.db.prepare('DELETE FROM tournament_results WHERE id=? AND tournament_id=?').run(resultId, id);
    return this.get(id, true);
  }
  start(id, name) {
    this.get(id);
    const player = normalizePlayer(name);
    this.db.prepare('INSERT OR IGNORE INTO tournament_sessions(id,tournament_id,player_id,name,started_at) VALUES(?,?,?,?,?)')
      .run(randomUUID(), id, player.id, player.name, this.clock());
    const session = this.db.prepare('SELECT * FROM tournament_sessions WHERE tournament_id=? AND player_id=?').get(id, player.id);
    return { id: session.id, name: session.name, startedAt: session.started_at, deadline: session.started_at + 7200000,
      submittedAt: session.submitted_at, answers: session.answers ? JSON.parse(session.answers) : undefined, serverNow: this.clock() };
  }
  submit(id, sessionId, answers) {
    this.get(id);
    const session = this.db.prepare('SELECT * FROM tournament_sessions WHERE tournament_id=? AND id=?').get(id, sessionId);
    if (!session) throw new Error('Start the session first.');
    if (!Array.isArray(answers) || answers.length !== 6 || answers.some((answer) => typeof answer !== 'string' || answer.length > 10000)) throw new Error('Invalid answers.');
    if (session.submitted_at !== null) throw new Error('Answers already submitted.');
    if (this.clock() > session.started_at + 7200000) throw new Error('The two-hour session has ended.');
    this.db.prepare('UPDATE tournament_sessions SET answers=?,submitted_at=? WHERE id=?').run(JSON.stringify(answers), this.clock(), sessionId);
    return { submittedAt: this.clock(), minutes: (this.clock() - session.started_at) / 60000, serverNow: this.clock() };
  }
}
