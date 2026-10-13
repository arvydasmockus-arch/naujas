import { Chess } from 'chess.js';

function parse(value) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

export function validateSprintStatisticsDate(date = '') {
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z'))
    || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date)) throw new Error('Invalid statistics date.');
  return date;
}

function answeredResults(session) {
  const answers = parse(session.answers), scores = parse(session.scores), seconds = parse(session.problemSeconds);
  return Array.from({ length: 3 }, (_, index) => answers[index]?.trim() ? {
    correct: Boolean(scores[index]), seconds: Number(seconds[index] ?? session.elapsedSeconds) || 0, reopened: false,
  } : null);
}

export function sprintLeaderboard(rows) {
  const players = new Map();
  for (const session of rows) {
    const row = players.get(session.playerId) ?? { id: session.playerId, name: session.name,
      testsPlayed: 0, problems: 0, correct: 0, wrongMoves: 0, totalSeconds: 0 };
    const results = answeredResults(session).filter(Boolean);
    row.testsPlayed++; row.problems += results.length;
    row.correct += results.filter((result) => result.correct).length;
    row.wrongMoves += results.filter((result) => !result.correct).length;
    // All three answers share one clock. Answer timestamps are cumulative,
    // so adding them would count the same tournament time repeatedly.
    row.totalSeconds += Math.max(0, Number(session.elapsedSeconds) || 0);
    players.set(session.playerId, row);
  }
  return [...players.values()].map((row) => ({ ...row,
    averageSeconds: row.problems ? Number((row.totalSeconds / row.problems).toFixed(2)) : 0,
    success: row.problems ? Number((100 * row.correct / row.problems).toFixed(2)) : 0,
  })).sort((a, b) => b.success - a.success || b.correct - a.correct || a.wrongMoves - b.wrongMoves || a.name.localeCompare(b.name));
}

export function sprintPlayerHistory(rows) {
  return { days: rows.map((session) => {
    const results = answeredResults(session);
    return { date: session.date, problems: results.filter(Boolean).length, points: results.filter((result) => result?.correct).length,
      totalSeconds: Math.max(0, Number(session.elapsedSeconds) || 0), results,
    };
  }).sort((a, b) => b.date.localeCompare(a.date)) };
}

export function sprintStatistics(rows, puzzles, includeMoves = false) {
  return Array.from({ length: 3 }, (_, ordinal) => {
    const answers = rows.map((row) => ({ name: row.name, answer: parse(row.answers)[ordinal] ?? '',
      correct: Boolean(parse(row.scores)[ordinal]), seconds: parse(row.problemSeconds)[ordinal] ?? row.elapsedSeconds }));
    const solved = answers.filter((answer) => answer.correct);
    const groups = new Map();
    for (const attempt of answers) {
      let move = attempt.answer.trim();
      if (move && puzzles[ordinal]?.fen) {
        try { move = new Chess(puzzles[ordinal].fen).move(move.replace(/[!?]+$/g, '')).san; }
        catch { /* Keep invalid submitted text visible as entered. */ }
      }
      const id = `${Number(attempt.correct)}:${move}`;
      const group = groups.get(id) ?? { move, correct: attempt.correct, count: 0, seconds: 0, players: [] };
      group.count++; group.seconds += attempt.seconds;
      group.players.push({ name: attempt.name, seconds: attempt.seconds });
      groups.set(id, group);
    }
    const moves = [...groups.values()].map((group) => ({ ...group, averageSeconds: group.seconds / group.count }))
      .sort((a, b) => Number(b.correct) - Number(a.correct) || Number(Boolean(b.move)) - Number(Boolean(a.move))
        || b.count - a.count || a.move.localeCompare(b.move));
    return { ordinal, solved: solved.length, failed: answers.length - solved.length,
      skipped: answers.filter((answer) => !answer.answer.trim()).length,
      averageSeconds: answers.length ? answers.reduce((sum, answer) => sum + answer.seconds, 0) / answers.length : null,
      averageCorrectSeconds: solved.length ? solved.reduce((sum, answer) => sum + answer.seconds, 0) / solved.length : null,
      wrongMoves: moves.filter((group) => group.move && !group.correct).map(({ move, count, seconds, averageSeconds }) => ({ move, count, seconds, averageSeconds })),
      ...(includeMoves ? { moves } : {}),
    };
  });
}
