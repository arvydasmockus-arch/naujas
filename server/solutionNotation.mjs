import { Chess } from 'chess.js';
import { parseSolution } from './solutionDraft.mjs';

export function compactSolution(puzzle) {
  const { phases } = parseSolution(puzzle);
  const lines = [];
  if (puzzle.key) {
    try { lines.push(`1.${new Chess(puzzle.fen).move(puzzle.key).san}!`); }
    catch { /* Use the source key when the stored key is unavailable. */ }
  }
  if (!lines.length) {
    const key = phases.find((phase) => phase.tokens[0]?.ply === 0 && phase.flag.includes('!') && !phase.flag.includes('?'))?.tokens[0];
    if (key) lines.push(key.text);
  }
  for (const phase of phases) {
    if (phase.tokens[0]?.ply !== 0 || !phase.flag.includes('?')) continue;
    const refutation = phase.tokens.find((token) => token.ply === 1 && token.text.endsWith('!'));
    lines.push(`${phase.tokens[0].text}${refutation ? ` ${refutation.text.replace(/^1\.\.\./, '')}` : ''}`);
  }
  return lines.join('\n');
}

function blackToMove(fen) {
  const fields = fen.split(' ');
  fields[1] = 'b'; fields[3] = '-';
  return fields.join(' ');
}

// Preserve the entire source, including comments, tries and refutations.
export function shortSolution(puzzle) {
  const source = puzzle.solution ?? '';
  const comments = [...source.matchAll(/\{[^}]*\}/gs)].map((match) => [match.index, match.index + match[0].length]);
  const pattern = /(?:(\d+)\.(\.\.)?\s*)?([KQRBSNP]?)([a-h][1-8])([-*x])([a-h][1-8])(?:=([QRBSN]))?|(?:(\d+)\.(\.\.)?\s*)?([O0]-[O0](?:-[O0])?)/g;
  let positions = new Map([[0, puzzle.fen], [1, blackToMove(puzzle.fen)]]);
  let previousPly = -1, previousEnd = 0, output = '', cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (comments.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const number = Number(match[1] ?? match[8]) || null;
    const dots = match[2] ?? match[9];
    const ply = number === null ? previousPly + 1 : (number - 1) * 2 + Number(Boolean(dots));
    if (ply === 0) positions = new Map([[0, puzzle.fen], [1, blackToMove(puzzle.fen)]]);
    let fen = positions.get(ply);
    if (ply > 0 && /threat\s*:/i.test(source.slice(previousEnd, match.index)) && positions.has(ply - 1)) {
      fen = blackToMove(positions.get(ply - 1));
      const fields = fen.split(' '); fields[1] = ply % 2 ? 'b' : 'w'; fen = fields.join(' ');
    }
    try {
      const chess = new Chess(fen);
      positions.set(ply, fen);
      const move = match[10] ? chess.move(match[10].replaceAll('0', 'O')) : chess.move({
        from: match[4], to: match[6], ...(match[7] ? { promotion: match[7].toLowerCase().replace('s', 'n') } : {}),
      });
      const prefix = /^(?:\d+\.(?:\.\.)?\s*)?/.exec(match[0])[0];
      let san = move.san;
      if (/^\s*[+#]/.test(source.slice(match.index + match[0].length))) san = san.replace(/[+#]$/, '');
      output += source.slice(cursor, match.index) + prefix + san;
      cursor = match.index + match[0].length;
      for (const depth of positions.keys()) if (depth > ply) positions.delete(depth);
      positions.set(ply + 1, chess.fen());
    } catch {
      // Keep an unparseable source move intact instead of guessing its origin.
      for (const depth of positions.keys()) if (depth > ply) positions.delete(depth);
    }
    previousPly = ply; previousEnd = match.index + match[0].length;
  }
  return output + source.slice(cursor);
}
