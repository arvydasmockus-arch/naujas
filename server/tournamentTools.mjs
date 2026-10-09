import { createHash } from 'node:crypto';
import { positionToFen } from './puzzleTools.mjs';
import { validateFen } from 'chess.js';
import { studyMoveCount } from './solutionDraft.mjs';

export const tournamentTypes = ['#2', '#3', '#n', 'study', 's#n', 'h#n'];
export const tournamentQueries = [
  '^#2$', '^#3$', '^#([4-9]|[1-9][0-9]+)$', '^[+=]$', '^s#[3-5]$', '^h#[3-7]$',
];
const solvingEvent = /solving|\bWCSC\b|\bECSC\b|\bISC\b|\bWSC\b|championship|sprendim|решени|löse|loese/i;
export function publicationDate(entry) {
  const date = entry.source?.date;
  if (!date || !Number.isInteger(Number(date.year)) || Number(date.year) < 1500) return null;
  const year = Number(date.year), month = date.month === undefined ? 12 : Number(date.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = date.day === undefined ? lastDay : Number(date.day);
  if (!Number.isInteger(day) || day < 1 || day > lastDay) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function oldEnough(publication, asOf = new Date().toISOString().slice(0, 10)) {
  if (!publication) return false;
  const cutoff = new Date(`${asOf}T12:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  return publication <= cutoff.toISOString().slice(0, 10);
}
export function knownSolvingUse(entry) {
  return [entry.source, ...(entry.reprints ?? [])].some((source) => source &&
    (source.type === 'solving event' || source.round !== undefined || solvingEvent.test(source.name ?? '')));
}
export function hasDefectLabel(entry) {
  const notes = JSON.stringify([entry.keywords ?? [], entry.comments ?? [], entry.solution ?? '',
    ...(entry.reprints ?? []).map((reprint) => reprint.comments ?? [])]).replace(/dual[- ]avoidance/gi, '');
  return /\b(?:duals?|dualized|cooked|cook|unsound)\b/i.test(notes);
}
export function hasWrittenSolution(entry) {
  return typeof entry.solution === 'string' && /\b\d+\.(?:\.\.)?\s*(?:[KQRBSNP]?[a-h][1-8]|[O0]-[O0])/i.test(entry.solution);
}
export function helpmateSolutionCount(entry) {
  const intended = String(entry['intended-solutions'] ?? '').trim();
  let declared = null;
  if (/^[1-9]\d*$/.test(intended)) declared = Number(intended);
  else if (/^[1-9]\d*(?:\.[1-9]\d*)+(?:\.\.\.)?$/.test(intended)) {
    declared = intended.replace(/\.\.\.$/, '').split('.').reduce((product, n) => product * Number(n), 1);
  } else if (intended) return null;
  const solution = (entry.solution ?? '').replace(/\{[^}]*\}/gs, '');
  // Actual terminal mating positions in the supplied Popeye solution.
  const endings = (solution.match(/#(?!\d)/g) ?? []).length;
  if (!endings || /\?/.test(solution)) return null;
  if (declared !== null && declared !== endings) return null;
  return declared ?? endings;
}
export function parseTournamentEntry(entry, checkedAt = new Date().toISOString()) {
  try {
    const published = publicationDate(entry);
    if (!oldEnough(published, checkedAt.slice(0, 10))) return null;
    if (!entry.id || !hasWrittenSolution(entry) || hasDefectLabel(entry) || entry.twins || entry['non-standard-stipulation'] || knownSolvingUse(entry)
      || (entry.options ?? []).some((option) => !['SetPlay', 'Defence 1'].includes(option))
      || (entry.keywords ?? []).some((keyword) => /cooked|incorrect|to delete|attention/i.test(keyword))) return null;
    const stipulation = entry.stipulation;
    let type;
    if (stipulation === '#2' || stipulation === '#3') type = stipulation;
    else if (/^#\d+$/.test(stipulation) && Number(stipulation.slice(1)) >= 4) type = '#n';
    else if (['+', '='].includes(stipulation)) type = 'study';
    else if (/^s#[3-5]$/.test(stipulation)) type = 's#n';
    else if (/^h#[3-7]$/.test(stipulation)) type = 'h#n';
    else return null;
    const studyMoves = type === 'study' ? studyMoveCount(entry.solution) : null;
    if (type === 'study' && (studyMoves === null || studyMoves > 10)) return null;
    const solutions = type === 'h#n' ? helpmateSolutionCount(entry) : null;
    if (type === 'h#n' && (solutions === null || solutions < 1 || solutions > 6)) return null;
    const fen = positionToFen(entry.algebraic);
    if (!validateFen(fen).ok) return null;
    const pieces = Object.values(entry.algebraic).flat();
    if (pieces.filter((piece) => /^K/.test(piece)).length !== 2) return null;
    return { id: String(entry.id), type, stipulation, fen, solutions, studyMoves,
      authors: entry.authors ?? [], source: entry.source?.name ?? '', year: entry.source?.date?.year ?? '',
      solution: entry.solution, sourceUrl: `https://www.yacpdb.org/#${entry.id}`,
      publicationDate: published, whiteCount: entry.algebraic.white?.length ?? 0, blackCount: entry.algebraic.black?.length ?? 0,
      positionHash: createHash('sha256').update(fen.split(' ')[0]).digest('hex'),
      usageCheckedAt: checkedAt, usageCheck: 'YACPDB NOT ReprintType(solving event)' };
  } catch { return null; }
}
export function latestSaturday(now = Date.now(), hour = 10) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  let offset = (date.getUTCDay() + 1) % 7;
  if (!offset && Number(parts.hour) < hour) offset = 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
export function rankResults(rows) {
  const ordered = rows.map((row) => ({ ...row, total: row.scores.reduce((sum, score) => sum + (score ?? 0), 0) }))
    .sort((a, b) => b.total - a.total || a.minutes - b.minutes || a.name.localeCompare(b.name));
  let previous;
  return ordered.map((row, index) => {
    const rank = previous && previous.total === row.total && previous.minutes === row.minutes ? previous.rank : index + 1;
    previous = { ...row, rank };
    return previous;
  });
}
