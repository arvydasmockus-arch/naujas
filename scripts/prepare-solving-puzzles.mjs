import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

// Local research samples, never downloaded by a player during a timed test.
const samples = [
  'C:/Users/arvyd/AppData/Local/Temp/ml-yacpdb-two-movers.json',
  'C:/Users/arvyd/AppData/Local/Temp/ml-yacpdb-two-movers-2.json',
];

function positionToFen(algebraic) {
  const board = Array(64).fill(null);
  for (const color of ['white', 'black']) {
    for (const piece of algebraic[color] ?? []) {
      const match = /^([KQRBSP])([a-h])([1-8])$/.exec(piece);
      if (!match) throw new Error('Non-classical piece');
      const index = (8 - Number(match[3])) * 8 + match[2].charCodeAt(0) - 97;
      if (board[index]) throw new Error('Duplicate square');
      const symbol = match[1].replace('S', 'N');
      board[index] = color === 'white' ? symbol : symbol.toLowerCase();
    }
  }
  const ranks = [];
  for (let rank = 0; rank < 8; rank++) {
    let text = '', empty = 0;
    for (const piece of board.slice(rank * 8, rank * 8 + 8)) {
      if (!piece) empty++;
      else {
        if (empty) text += empty;
        empty = 0;
        text += piece;
      }
    }
    if (empty) text += empty;
    ranks.push(text);
  }
  return `${ranks.join('/')} w - - 0 1`;
}

function forcesMateInTwo(chess, move) {
  chess.move(move);
  // Only exact #2 positions, not mate in one or stalemate.
  const replies = chess.moves({ verbose: true });
  let valid = replies.length > 0;
  for (const reply of replies) {
    chess.move(reply);
    let hasMate = false;
    for (const response of chess.moves({ verbose: true })) {
      chess.move(response);
      hasMate = chess.isCheckmate();
      chess.undo();
      if (hasMate) break;
    }
    chess.undo();
    if (!hasMate) { valid = false; break; }
  }
  chess.undo();
  return valid;
}

const puzzles = [];
const seen = new Set();
let skipped = 0;
for (const file of samples) {
  const data = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  for (const entry of data.result.entries) {
    try {
      if (entry.stipulation !== '#2' || entry.twins || entry['non-standard-stipulation']
        || entry.algebraic.neutral?.length || (entry.options ?? []).some((option) => !['SetPlay', 'Defence 1'].includes(option))
        || (entry.keywords ?? []).some((keyword) => /cooked|incorrect|to delete|attention/i.test(keyword))) continue;
      const fen = positionToFen(entry.algebraic);
      if (seen.has(fen)) continue;
      // Root moves marked ! are keys; lines marked ? are tries, not answers.
      const keys = [...entry.solution.matchAll(/^\s*1\.([KQRBS]?)([a-h][1-8])[-*x]([a-h][1-8])(?:=([QRBS]))?\s*!/gm)];
      if (keys.length !== 1) continue;
      const key = keys[0];
      const chess = new Chess(fen);
      const expected = chess.moves({ verbose: true }).find((move) => move.from === key[2] && move.to === key[3]
        && (move.promotion ?? '') === (key[4]?.toLowerCase().replace('s', 'n') ?? ''));
      if (!expected || !forcesMateInTwo(chess, expected)) continue;
      // Reject extra keys: each playable test has exactly one correct first move.
      const alternatives = chess.moves({ verbose: true }).filter((move) => move.lan !== expected.lan);
      if (alternatives.some((move) => forcesMateInTwo(chess, move))) continue;
      seen.add(fen);
      puzzles.push({
        id: String(entry.id), fen, key: expected.lan, keySan: expected.san,
        authors: entry.authors ?? [],
        source: entry.source?.name ?? '', year: entry.source?.date?.year ?? '',
        sourceUrl: `https://www.yacpdb.org/#${entry.id}`,
        solution: entry.solution,
      });
      if (puzzles.length % 10 === 0) console.log(`Verified ${puzzles.length} puzzles`);
    } catch { skipped++; }
  }
}
if (puzzles.length < 6) throw new Error('Not enough verified puzzles');
writeFileSync(new URL('../src/solvingPuzzles.json', import.meta.url), JSON.stringify(puzzles, null, 2) + '\n');
console.log(JSON.stringify({ imported: puzzles.length, skipped, source: 'YACPDB local samples' }));
