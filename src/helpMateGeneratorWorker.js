import createPopeye from './lib/popeye/py.js';
import { Chess } from 'chess.js';
import { buildPopeyeInput, parsePopeyeOutput } from './lib/popeyeSolver.js';
import { allWhitePiecesParticipate, countKeyMoves, getBlackNonKingSquares, getBlackPieceCountRange, getIdealHelpmateTwinLevel, hasHelpmateDual, hasInitialChessMaterial, hasSameSolutionSet, isGeneratedCandidate, removeFenPiece } from './lib/helpMateGenerator.js';

let modulePromise;
let currentRun = null;
let activeOutput = null;

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function boardFen(board) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank * 8 + file];
      if (!piece) empty += 1;
      else {
        if (empty) row += empty;
        empty = 0;
        row += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} w - - 0 1`;
}

function randomPosition(config) {
  const board = Array(64).fill(null);
  const emptySquares = () => board.map((piece, index) => piece ? -1 : index).filter((index) => index >= 0);
  const materialLimits = { Q: 1, R: 2, B: 2, N: 2, P: 8 };
  const place = (color, kind) => {
    let squares = emptySquares().filter((index) => kind !== 'P' || (index >> 3) > 0 && (index >> 3) < 7);
    if (kind === 'B') {
      const bishops = board.map((piece, index) => piece === color + 'B' ? index : -1).filter((index) => index >= 0);
      if (bishops.length) {
        const bishopColor = (bishops[0] & 7) + (bishops[0] >> 3);
        squares = squares.filter((index) => ((index & 7) + (index >> 3)) % 2 !== bishopColor % 2);
      }
    }
    if (!squares.length) return false;
    board[randomItem(squares)] = color + kind;
    return true;
  };

  if (!place('w', 'K') || !place('b', 'K')) return null;
  const whiteKing = board.findIndex((piece) => piece === 'wK');
  const blackKing = board.findIndex((piece) => piece === 'bK');
  if (Math.max(Math.abs((whiteKing & 7) - (blackKing & 7)), Math.abs((whiteKing >> 3) - (blackKing >> 3))) < 2) return null;

  const blackRange = getBlackPieceCountRange(config.blackCount, config.whiteCount, config.blackPieces);
  if (!blackRange) return null;
  const blackCount = blackRange.minimum + Math.floor(Math.random() * (blackRange.maximum - blackRange.minimum + 1));

  for (const [color, count, pieces] of [['w', config.whiteCount, config.whitePieces], ['b', blackCount, config.blackPieces]]) {
    for (let index = 1; index < count; index += 1) {
      const available = pieces.filter((kind) => board.filter((piece) => piece === color + kind).length < materialLimits[kind]);
      if (!available.length) return null;
      const kind = randomItem(available);
      if (!place(color, kind)) return null;
    }
  }

  const fen = boardFen(board);
  if (!hasInitialChessMaterial(fen)) return null;
  try { new Chess(fen); return fen; } catch { /* The side to move may be in check in a valid composition. */ }
  try { new Chess(fen.replace(' w ', ' b ')); return fen; } catch { return null; }
}

async function getPopeye(wasmUrl) {
  if (!modulePromise) {
    modulePromise = createPopeye({
      noInitialRun: true,
      locateFile: () => wasmUrl,
      print: (line) => activeOutput?.push(line),
      printErr: (line) => activeOutput?.push(line),
    });
  }
  return modulePromise;
}

function solvePosition(popeye, fen, stipulation) {
  const output = [];
  activeOutput = output;
  popeye.FS.writeFile('/ml-h-generator.inp', `BeginProblem\n${buildPopeyeInput(fen, stipulation)}\nEndProblem`);
  try { popeye.callMain(['-maxmem', '512M', '/ml-h-generator.inp']); } catch { /* Popeye may exit via its Emscripten wrapper. */ }
  activeOutput = null;
  return parsePopeyeOutput(output.join('\n'), stipulation);
}

async function areBlackPiecesEssential(popeye, fen, groups, stipulation, runId) {
  const squares = getBlackNonKingSquares(fen);
  for (let index = 0; index < squares.length; index += 1) {
    if (currentRun !== runId) return false;
    self.postMessage({ type: 'progress', runId, stage: 'black-essential', piece: index + 1, pieceCount: squares.length });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (currentRun !== runId) return false;
    const reducedFen = removeFenPiece(fen, squares[index]);
    if (!reducedFen) return false;
    const reducedGroups = solvePosition(popeye, reducedFen, stipulation);
    if (hasSameSolutionSet(groups, reducedGroups)) return false;
  }
  return true;
}

async function runGenerator(data) {
  const { runId, config } = data;
  currentRun = runId;
  const popeye = await getPopeye(data.wasmUrl);
  const seen = new Set(data.seenPositions || []);
  const checkedPositions = [];
  let attempts = 0;
  let found = 0;
  let solvedPositions = 0;
  let matchingSolutionCount = 0;
  let matchingNoDuals = 0;
  let matchingWhiteParticipation = 0;
  let matchingIdealTheme = 0;
  let matchingBlackEssential = 0;
  const maxAttempts = data.maxAttempts || 100000;
  const flushChecked = () => {
    if (!checkedPositions.length) return;
    self.postMessage({ type: 'checked', runId, positions: checkedPositions.splice(0) });
  };

  while (attempts < maxAttempts && found < config.candidateCount && currentRun === runId) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (currentRun !== runId) { flushChecked(); return; }
    const fen = randomPosition(config);
    attempts += 1;
    const positionKey = fen?.split(' ')[0];
    if (fen && !seen.has(positionKey)) {
      seen.add(positionKey);
      checkedPositions.push(positionKey);
      if (currentRun !== runId) { flushChecked(); return; }
      const stipulation = `h${config.moves}`;
      const groups = solvePosition(popeye, fen, stipulation);
      const roots = countKeyMoves(groups);
      if (roots > 0) solvedPositions += 1;
      const hasDual = hasHelpmateDual(groups, fen);
      const whitePiecesParticipate = roots === config.solutionCount && allWhitePiecesParticipate(fen, groups);
      const idealThemeLevel = getIdealHelpmateTwinLevel(groups, fen);
      const idealThemeMatches = roots === config.solutionCount && idealThemeLevel > 0;
      if (roots === config.solutionCount) {
        matchingSolutionCount += 1;
        if (!hasDual) matchingNoDuals += 1;
        if (whitePiecesParticipate) matchingWhiteParticipation += 1;
        if (idealThemeMatches) matchingIdealTheme += 1;
      }
      const filters = config.filters || [];
      if (whitePiecesParticipate && (!filters.includes('ideal-twin') || idealThemeMatches)
        && isGeneratedCandidate(groups, config, fen)) {
        const blackPiecesEssential = await areBlackPiecesEssential(popeye, fen, groups, stipulation, runId);
        if (currentRun !== runId) { flushChecked(); return; }
        if (blackPiecesEssential) {
          if (roots === config.solutionCount) matchingBlackEssential += 1;
          found += 1;
          self.postMessage({ type: 'candidate', runId, candidate: { fen, groups, roots, themeLevel: idealThemeLevel, number: found } });
        }
      }
    }
    if (checkedPositions.length >= 250) flushChecked();
    if (attempts % 100 === 0 || found === config.candidateCount) self.postMessage({ type: 'progress', runId, attempts, found, solvedPositions, matchingSolutionCount, matchingNoDuals, matchingWhiteParticipation, matchingIdealTheme, matchingBlackEssential, maxAttempts });
  }
  flushChecked();
  if (currentRun === runId) self.postMessage({ type: 'complete', runId, attempts, found, solvedPositions, matchingSolutionCount, matchingNoDuals, matchingWhiteParticipation, matchingIdealTheme, matchingBlackEssential, maxAttempts });
  currentRun = null;
}

self.onmessage = ({ data }) => {
  if (data?.type === 'cancel') {
    if (currentRun === data.runId) currentRun = null;
    return;
  }
  if (data?.type === 'generate' && currentRun === null) {
    runGenerator(data).catch((error) => {
      self.postMessage({ type: 'error', runId: data.runId, message: error?.message || String(error) });
      currentRun = null;
    });
  }
};
