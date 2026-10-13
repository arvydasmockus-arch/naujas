import { Chess } from 'chess.js';

function parse(value) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
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
