import createPopeye from './lib/popeye/py.js';
import { Chess } from 'chess.js';
import { buildPopeyeInput, parsePopeyeOutput } from './lib/popeyeSolver.js';
import { allWhitePiecesParticipate, hasHelpmateDual, hasInitialChessMaterial, hasRepeatedMatingPieceOnSameSquare } from './lib/helpMateGenerator.js';

let modulePromise;
let currentRun = null;
let activeOutput = null;

const corners = [
  { square: 'h1', index: 7, label: 'a' },
  { square: 'a1', index: 0, label: 'b' },
  { square: 'a8', index: 56, label: 'c' },
  { square: 'h8', index: 63, label: 'd' },
];
const materialLimits = { Q: 1, R: 2, B: 2, N: 2, P: 8 };
const SOLVE_TIME_LIMIT_SECONDS = 3;

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function placementToFen(board) {
  const ranks = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let line = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank * 8 + file];
      if (!piece) { empty += 1; continue; }
      if (empty) line += empty;
      empty = 0;
      line += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();
    }
    if (empty) line += empty;
    ranks.push(line);
  }
  return `${ranks.join('/')} w - - 0 1`;
}

function randomBase() {
  const board = Array(64).fill(null);
  const emptySquares = () => board.map((piece, index) => piece ? -1 : index).filter((index) => index >= 0);
  const place = (color, kind) => {
    const squares = emptySquares().filter((index) => kind !== 'P' || (index >> 3) > 0 && (index >> 3) < 7);
    if (!squares.length) return false;
    board[randomItem(squares)] = color + kind;
    return true;
  };
  if (!place('w', 'K') || !place('b', 'K')) return null;
  const kings = ['wK', 'bK'].map((king) => board.findIndex((piece) => piece === king));
  if (Math.max(Math.abs((kings[0] & 7) - (kings[1] & 7)), Math.abs((kings[0] >> 3) - (kings[1] >> 3))) < 2) return null;

  const whiteExtraCount = 4 + Math.floor(Math.random() * 5);
  const blackExtraCount = 4 + Math.floor(Math.random() * 6);
  for (const [color, count, allowed] of [['w', whiteExtraCount, ['Q', 'R', 'P']], ['b', blackExtraCount, ['Q', 'R', 'B', 'N', 'P']]]) {
    for (let i = 0; i < count; i += 1) {
      const available = allowed.filter((kind) => board.filter((piece) => piece === color + kind).length < materialLimits[kind]);
      if (!available.length || !place(color, randomItem(available))) return null;
    }
  }
  if (corners.some(({ index }) => board[index])) return null;
  const fen = placementToFen(board);
  try { new Chess(fen); } catch { return null; }
  return fen;
}

function cornerFen(baseFen, piece, index) {
  const parts = baseFen.split(' ');
  const ranks = parts[0].split('/').map((rank) => {
    const squares = [];
    for (const char of rank) {
      if (/^[1-8]$/.test(char)) for (let i = 0; i < Number(char); i += 1) squares.push(null);
      else squares.push(char);
    }
    return squares;
  });
  const rank = Math.floor(index / 8);
  const file = index % 8;
  const fenRow = 7 - rank;
  if (ranks[fenRow][file]) return null;
  ranks[fenRow][file] = piece;
  const encoded = ranks.map((squares) => {
    let row = '';
    let empty = 0;
    for (const square of squares) {
      if (!square) { empty += 1; continue; }
      if (empty) row += empty;
      empty = 0;
      row += square;
    }
    if (empty) row += empty;
    return row;
  });
  return `${encoded.join('/')} ${parts.slice(1).join(' ')}`;
}

async function getPopeye(wasmUrl) {
  if (!modulePromise) modulePromise = createPopeye({
    noInitialRun: true,
    locateFile: () => wasmUrl,
    print: (line) => activeOutput?.push(line),
    printErr: (line) => activeOutput?.push(line),
  });
  return modulePromise;
}

async function solve(popeye, fen) {
  const output = [];
  activeOutput = output;
  popeye.FS.writeFile('/ml-corner-twin.inp', `BeginProblem\n${buildPopeyeInput(fen, 'h2')}\nEndProblem`);
  try { popeye.callMain(['-maxmem', '512M', '-maxtime', String(SOLVE_TIME_LIMIT_SECONDS), '/ml-corner-twin.inp']); } catch { /* Popeye may exit through its Emscripten wrapper. */ }
  activeOutput = null;
  return parsePopeyeOutput(output.join('\n'), 'h2');
}

async function run(data) {
  const { runId, wasmUrl, targetCount = 1, maxAttempts = 2_000_000 } = data;
  currentRun = runId;
  const popeye = await getPopeye(wasmUrl);
  let attempts = 0;
  let found = 0;
  while (attempts < maxAttempts && found < targetCount && currentRun === runId) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (currentRun !== runId) break;
    attempts += 1;
    self.postMessage({ type: 'progress', runId, attempts, found, maxAttempts, stage: 'position', variant: 0 });
    const baseFen = randomBase();
    if (!baseFen) continue;
    const variants = [];
    let valid = true;
    let variantNumber = 0;
    for (const [piece, colorName] of [['N', 'knight'], ['B', 'bishop']]) {
      for (const corner of corners) {
        variantNumber += 1;
        self.postMessage({ type: 'progress', runId, attempts, found, maxAttempts, stage: 'variant', variant: variantNumber });
        const fen = cornerFen(baseFen, piece, corner.index);
        if (!fen || !hasInitialChessMaterial(fen)) { valid = false; break; }
        const groups = await solve(popeye, fen);
        if (currentRun !== runId) { valid = false; break; }
        if (groups.play.length !== 1 || !allWhitePiecesParticipate(fen, groups)
          || hasHelpmateDual(groups, fen) || hasRepeatedMatingPieceOnSameSquare(fen, groups)) {
          valid = false;
          break;
        }
        variants.push({ label: `${corner.label})`, piece: colorName, square: corner.square, fen, groups });
      }
      if (!valid) break;
    }
    if (valid && variants.length === 8) {
      found += 1;
      self.postMessage({ type: 'candidate', runId, candidate: { baseFen, variants, number: found } });
    }
    if (found === targetCount) self.postMessage({ type: 'progress', runId, attempts, found, maxAttempts, stage: 'position', variant: 0 });
  }
  if (currentRun === runId) self.postMessage({ type: 'complete', runId, attempts, found, maxAttempts });
  currentRun = null;
}

self.onmessage = ({ data }) => {
  if (data?.type === 'cancel') { if (currentRun === data.runId) currentRun = null; return; }
  if (data?.type === 'generate' && currentRun === null) run(data).catch((error) => {
    self.postMessage({ type: 'error', runId: data.runId, message: error?.message || String(error) });
    currentRun = null;
  });
};
