import { oldEnough, parseTournamentEntry } from './tournamentTools.mjs';
import { parseEntry, trainingDifficulty, verifyPuzzle } from './puzzleTools.mjs';
import { Chess } from 'chess.js';

export const SPRINT_PROBLEM_COUNT = 3;
export const SPRINT_MIN_PIECES = 20;
export const SPRINT_MIN_ALTERNATIVES = 0;

export function countWrongKeyTries(solution = '') {
  const moves = new Set();
  String(solution).split(/\r?\n/).forEach((line) => {
    const move = /^\s*1\.\s*(\S+)(.*)$/.exec(line);
    if (!move) return;
    const moveMarkedWrong = /\?{1,2}[!?]*$/.test(move[1]);
    const annotationMarkedWrong = /^\s*(?:[+#]+\s*)?\?{1,2}[!?]*(?:\s|$)/.test(move[2]);
    if (moveMarkedWrong || annotationMarkedWrong) moves.add(move[1].replace(/[!?+#]+$/g, ''));
  });
  return moves.size;
}

export function localSprintDate(timestamp = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}

export function sprintDifficulty(puzzle) {
  const { pieces, alternativeMoves } = trainingDifficulty(puzzle);
  return { pieces, alternativeMoves, score: pieces + alternativeMoves * 2,
    eligible: true };
}

export function sampleSprintRows(rows, date, count = Number.POSITIVE_INFINITY) {
  if (!rows.length) return [];
  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const start = (Math.floor(Date.parse(date + 'T12:00:00Z') / 86400000) * 97) % ordered.length;
  return Array.from({ length: Math.min(count, ordered.length) }, (_, index) => ordered[(start + index) % ordered.length]);
}

export function sprintCandidates(rows, date, excludedPositions = new Set()) {
  const candidates = [];
  const seen = new Set();
  for (const row of rows) {
    try {
      const raw = JSON.parse(row.raw);
      if (raw.stipulation !== '#2' || raw.twins || raw['intended-solutions'] && String(raw['intended-solutions']) !== '1') continue;
      if (/^\s*(?:[ab]\s*[).:]|\([ab]\))\s*/mi.test(raw.solution ?? '')
        || (raw.keywords ?? []).some((word) => /\btwins?\b/i.test(word))) continue;
      const puzzle = parseTournamentEntry(raw, date + 'T12:00:00.000Z');
      if (!puzzle || !oldEnough(puzzle.publicationDate, date) || excludedPositions.has(puzzle.positionHash)) continue;
      const roots = [...(raw.solution ?? '').matchAll(/^\s*1\.([KQRBS]?)([a-h][1-8])[-*x]([a-h][1-8])(?:=([QRBS]))?\s*!/gm)];
      // Exactly one key; multiple solutions and a/b twins never qualify.
      if (roots.length !== 1) continue;
      let parsed;
      if (row.puzzle) {
        const cached = JSON.parse(row.puzzle);
        if (cached.fen === puzzle.fen && cached.key) parsed = cached;
      }
      parsed ??= parseEntry(raw);
      if (!parsed?.key || seen.has(puzzle.positionHash)) continue;
      seen.add(puzzle.positionHash);
      const pieces = puzzle.whiteCount + puzzle.blackCount;
      candidates.push({ ...puzzle, key: parsed.key, pieces, wrongKeyTries: countWrongKeyTries(raw.solution) });
    } catch { /* Malformed records are excluded. */ }
  }
  candidates.sort((a, b) => Math.min(b.pieces, 20) - Math.min(a.pieces, 20)
    || Number(b.wrongKeyTries >= 5) - Number(a.wrongKeyTries >= 5)
    || b.wrongKeyTries - a.wrongKeyTries || b.pieces - a.pieces || a.id.localeCompare(b.id));
  return candidates;
}

export function verifySprintPuzzle(puzzle) {
  // Check every defence for exactly one mating continuation, then exclude extra keys.
  try {
    const chess = new Chess(puzzle.fen);
    chess.move(puzzle.key);
    const replies = chess.moves({ verbose: true });
    if (!replies.length) return false;
    for (const reply of replies) {
      chess.move(reply);
      let mates = 0;
      for (const response of chess.moves({ verbose: true })) {
        chess.move(response);
        mates += Number(chess.isCheckmate());
        chess.undo();
        if (mates > 1) return false;
      }
      chess.undo();
      if (mates !== 1) return false;
    }
    return verifyPuzzle(puzzle);
  } catch { return false; }
}

export function selectSprintPuzzles(rows, date, validate = verifySprintPuzzle, excludedPositions = new Set()) {
  const candidates = sprintCandidates(rows, date, excludedPositions);
  const selected = [];
  for (const puzzle of candidates) {
    if (!validate(puzzle)) continue;
    selected.push({ ...puzzle, ...sprintDifficulty(puzzle) });
    if (selected.length === SPRINT_PROBLEM_COUNT) break;
  }
  if (selected.length < SPRINT_PROBLEM_COUNT) {
    throw new Error('The daily round needs three unique, older, defect-free mate-in-two problems. Only '
      + selected.length + ' currently qualify.');
  }
  return selected;
}
