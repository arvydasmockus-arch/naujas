import { Chess } from 'chess.js';

const cache = new Map();
export function studyMoveCount(solution) {
  const plain = (solution ?? '').replace(/\{[^}]*\}/gs, '');
  const moves = [...plain.matchAll(/\b(\d+)\.(?:\.\.)?\s*(?:[KQRBSNP]?[a-h][1-8]|[O0]-[O0])/gi)];
  return moves.length ? Math.max(...moves.map((move) => Number(move[1]))) : null;
}
function rounded(value) { return String(Math.round(value * 100) / 100); }
function nullTurn(fen) { const fields = fen.split(' '); fields[1] = fields[1] === 'w' ? 'b' : 'w'; fields[3] = '-'; return fields.join(' '); }
export function parseSolution(puzzle) {
  const help = puzzle.type === 'h#n';
  const original = (puzzle.solution ?? '').replace(/\{[^}]*\}/gs, '');
  const pattern = /(?:(\d+)\.(\.\.)?\s*)?([KQRBSNP]?)([a-h][1-8])([-*x])([a-h][1-8])(?:=([QRBSN]))?\s*([+#?!]*)|(?:(\d+)\.(\.\.)?\s*)?([O0]-[O0](?:-[O0])?)\s*([+#?!]*)/g;
  const phases = []; const warnings = new Set();
  let positions = new Map(), phase, previousPly = -1, previousEnd = 0;
  for (const match of original.matchAll(pattern)) {
    const number = Number(match[1] ?? match[9]) || null;
    const dots = match[2] ?? match[10];
    const flag = match[8] ?? match[12] ?? '';
    const ply = number !== null ? (number - 1) * 2 + (dots ? help ? 0 : 1 : 0) : previousPly + 1;
    if (ply === 0 || !phase) {
      const fields = puzzle.fen.split(' '); fields[1] = help ? 'b' : 'w';
      positions = new Map([[0, fields.join(' ')]]);
      phase = { tokens: [], flag, lines: [] }; phases.push(phase);
    }
    const beforeText = original.slice(previousEnd, match.index);
    const threat = /threat\s*:/i.test(beforeText);
    let fen = positions.get(ply);
    if (!fen && ply > 0 && positions.has(ply - 1) && threat) fen = nullTurn(positions.get(ply - 1));
    let san, after = null;
    const promotion = match[7]?.toLowerCase().replace('s', 'n');
    try {
      if (!fen) throw new Error('Missing branch position');
      const chess = new Chess(fen);
      const move = match[11] ? chess.move(match[11].replaceAll('0', 'O')) : chess.move({ from: match[4], to: match[6], ...(promotion ? { promotion } : {}) });
      san = move.san; after = chess.fen();
    } catch {
      // Ambiguous/incomplete source branches are not shortened by guessing.
      san = match[11] ?? `${match[3].replace('S', 'N')}${match[4]}${match[5] === '-' ? '-' : 'x'}${match[6]}${promotion ? `=${promotion.toUpperCase()}` : ''}`;
      warnings.add('Some source branches need manual review; their departure squares were retained.');
    }
    const white = help ? ply % 2 === 1 : ply % 2 === 0;
    const fullNumber = Math.floor(ply / 2) + 1;
    const prefix = help ? white ? '' : `${fullNumber}.` : white ? `${fullNumber}.` : `${fullNumber}...`;
    const mark = flag.includes('?') ? '?' : flag.includes('!') ? '!' : '';
    const token = { ply, white, number: fullNumber, text: `${prefix}${san}${mark}`, phase, threat, points: null };
    phase.tokens.push(token);
    if (after) {
      for (const key of [...positions.keys()]) if (key > ply) positions.delete(key);
      positions.set(ply + 1, after);
    }
    previousPly = ply; previousEnd = match.index + match[0].length;
  }
  return { phases, warnings: [...warnings] };
}
function display(tokens) {
  return tokens.map((token, index) => {
    const move = !token.white && index > 0 ? token.text.replace(/^\d+\.\.\./, '') : token.text;
    return `${token.threat ? '~ ' : ''}${move}${token.points === null ? '' : ` [${rounded(token.points)}]`}`;
  }).join(' ');
}
export function solutionDraft(puzzle) {
  const cacheKey = `${puzzle.fen}:${puzzle.type}:${puzzle.solution}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const parsed = parseSolution(puzzle);
  const main = parsed.phases.filter((phase) => !phase.flag.includes('?'));
  const tries = parsed.phases.filter((phase) => phase.flag.includes('?'));
  let lines = [];
  if (puzzle.type === '#2') {
    for (const phase of main) {
      const key = phase.tokens[0]; if (!key) continue;
      if (main.length === 1) key.points = 5;
      else parsed.warnings.push('More than one source key; check the intended solution before assigning points.');
      lines.push(display([key]));
    }
    for (const phase of tries) {
      const refutation = phase.tokens.find((token) => !token.white && token.text.endsWith('!'))
        ?? phase.tokens.find((token) => !token.white);
      lines.push(display([phase.tokens[0], ...(refutation ? [refutation] : [])]));
    }
  } else {
    const moves = Number(puzzle.stipulation.replace(/\D/g, ''));
    const targets = main.flatMap((phase) => phase.tokens.filter((token) => token.white &&
      (puzzle.type === 'study' ? true : token.number === (puzzle.type === '#3' ? 2 : puzzle.type === '#n' ? moves - 1 : moves))));
    if (['#3', '#n', 'h#n', 's#n'].includes(puzzle.type)) {
      // Each marker is the value of this line, not a running total.
      // Distribute hundredths so even thirds/sixths still add up to five.
      const base = Math.floor(500 / targets.length), remainder = 500 % targets.length;
      targets.forEach((token, index) => { token.points = (base + (index < remainder ? 1 : 0)) / 100; });
    } else if (puzzle.type === 'study') {
      const first = main[0]?.tokens.find((token) => token.white);
      if (first) first.points = 1;
    }
    for (const phase of main) {
      if (puzzle.type === 'h#n' || puzzle.type === 's#n') {
        let path = [];
        phase.tokens.forEach((token, index) => {
          path = path.slice(0, token.ply); path[token.ply] = token;
          if (token.white && token.number === moves) {
            const next = phase.tokens[index + 1];
            lines.push(display([...path.filter(Boolean), ...(puzzle.type === 's#n' && next?.ply === token.ply + 1 ? [next] : [])]));
          }
        });
        continue;
      }
      let line = [];
      for (const token of phase.tokens) {
        if (line.length && token.ply <= line.at(-1).ply) { lines.push(display(line)); line = []; }
        line.push(token);
      }
      if (line.length) lines.push(display(line));
    }
  }
  const result = { text: lines.join('\n') || puzzle.solution, warnings: [...new Set(parsed.warnings)] };
  if (cache.size > 200) cache.clear();
  cache.set(cacheKey, result); return result;
}
