import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';

export function positionToFen(algebraic) {
  if (!algebraic || algebraic.neutral?.length) throw new Error('Non-classical position');
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
  return Array.from({ length: 8 }, (_, rank) => {
    let text = '', empty = 0;
    for (const piece of board.slice(rank * 8, rank * 8 + 8)) {
      if (!piece) empty++;
      else { if (empty) text += empty; empty = 0; text += piece; }
    }
    return text + (empty || '');
  }).join('/') + ' w - - 0 1';
}

export function parseEntry(entry) {
  try {
    if (entry.stipulation !== '#2' || entry.twins || entry['non-standard-stipulation']
      || (entry.options ?? []).some((option) => !['SetPlay', 'Defence 1'].includes(option))
      || (entry.keywords ?? []).some((keyword) => /cooked|incorrect|to delete|attention/i.test(keyword))) return null;
    const fen = positionToFen(entry.algebraic);
    const roots = [...(entry.solution ?? '').matchAll(/^\s*1\.([KQRBS]?)([a-h][1-8])[-*x]([a-h][1-8])(?:=([QRBS]))?\s*!/gm)];
    if (roots.length !== 1) return null;
    const root = roots[0];
    const chess = new Chess(fen);
    const move = chess.move({ from: root[2], to: root[3], ...(root[4] ? { promotion: root[4].toLowerCase().replace('s', 'n') } : {}) });
    return { id: String(entry.id), fen, key: move.lan, keySan: move.san,
      authors: entry.authors ?? [], source: entry.source?.name ?? '', year: entry.source?.date?.year ?? '',
      sourceUrl: `https://www.yacpdb.org/#${entry.id}`, solution: entry.solution,
      positionHash: createHash('sha256').update(fen).digest('hex') };
  } catch { return null; }
}

export function forcesMateInTwo(chess, move) {
  chess.move(move);
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

export function verifyPuzzle(puzzle) {
  try {
    const chess = new Chess(puzzle.fen);
    const moves = chess.moves({ verbose: true });
    const key = moves.find((move) => move.lan === puzzle.key);
    if (!key || !forcesMateInTwo(chess, key)) return false;
    for (const move of moves.filter((candidate) => candidate.lan !== key.lan)) {
      chess.move(move);
      const mateInOne = chess.isCheckmate();
      chess.undo();
      if (mateInOne || forcesMateInTwo(chess, move)) return false;
    }
    return true;
  } catch { return false; }
}
