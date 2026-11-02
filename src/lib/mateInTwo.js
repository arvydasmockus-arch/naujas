import { Chess } from 'chess.js';

const pieceNames = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'S' };
const moveOrder = { r: 0, n: 1, p: 2, q: 3, b: 4, k: 5 };
const files = 'abcdefgh';

function squareName(square) {
  return files[square & 7] + (8 - (square >> 4));
}

// chess.js's public verbose move API also creates SAN/FEN snapshots for every
// move. The solver only needs legal raw moves, so use its internal 0x88 API.
function legalMoves(game) {
  return game._moves().map((move) => ({
    ...move,
    from: squareName(move.from),
    to: squareName(move.to),
    raw: move,
  }));
}

function makeMove(game, move) {
  game._makeMove(move.raw || move);
}

function undoMove(game) {
  game._undoMove();
}

function compareMoves(a, b) {
  return (moveOrder[a.piece] ?? 6) - (moveOrder[b.piece] ?? 6)
    || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
}

function orderedMoves(moves) {
  return [...moves].sort(compareMoves);
}

function moveText(move, moveNumber, suffix = '') {
  const piece = pieceNames[move.piece] || '';
  const separator = move.captured ? '*' : '-';
  const promotion = move.promotion ? '=' + (pieceNames[move.promotion] || move.promotion.toUpperCase()) : '';
  const prefix = move.color === 'b' ? `${moveNumber}...` : `${moveNumber}.`;
  const suffixText = suffix ? (suffix.startsWith(' ') ? suffix : ' ' + suffix) : '';
  return `${prefix}${piece}${move.from}${separator}${move.to}${promotion}${suffixText}`;
}

function createMateMoveFinder() {
  // The same resulting positions are revisited while classifying Key, Try and
  // Set. Cache by FEN so chess.js only performs the mate-in-one scan once.
  const cache = new Map();
  const completeResults = new Set();
  const positionKey = (game) => game.fen().split(' ').slice(0, 4).join(' ');
  function hasMatingMove(game) {
    const key = positionKey(game);
    if (cache.has(key)) return cache.get(key).length > 0;
    for (const move of legalMoves(game)) {
      makeMove(game, move);
      // Most legal moves are not checks. Avoid generating the opponent's
      // legal replies unless the move actually gives check.
      const isMate = game.isCheck() && game.isCheckmate();
      undoMove(game);
      if (isMate) {
        cache.set(key, [move]);
        return true;
      }
    }
    cache.set(key, []);
    return false;
  }
  function matingMoves(game) {
    const key = positionKey(game);
    if (completeResults.has(key)) return cache.get(key);
    if (cache.has(key) && cache.get(key).length === 0) return [];
    const first = cache.get(key) || [];
    const found = [...first];
    const foundKeys = new Set(found.map(({ from, to, promotion }) => `${from}${to}${promotion || ''}`));
    for (const move of legalMoves(game)) {
      const moveKey = `${move.from}${move.to}${move.promotion || ''}`;
      if (foundKeys.has(moveKey)) continue;
      makeMove(game, move);
      const isMate = game.isCheck() && game.isCheckmate();
      undoMove(game);
      if (isMate) {
        found.push(move);
        foundKeys.add(moveKey);
      }
    }
    cache.set(key, found);
    completeResults.add(key);
    return found;
  }
  return { hasMatingMove, matingMoves };
}

function moveSuffix(game) {
  return game.isCheckmate() ? '#' : game.isCheck() ? '+' : '';
}

function turnFen(fen, turn) {
  const fields = fen.trim().split(/\s+/);
  if (fields.length === 1) fields.push(turn, '-', '-', '0', '1');
  else fields[1] = turn;
  return fields.join(' ');
}

function pushReplies(lines, game, defense, replies) {
  lines.push('      ' + moveText(defense, 1, moveSuffixAfter(game, defense)));
  replies.forEach((reply) => lines.push('          ' + moveText(reply, 2, '#')));
}

function moveSuffixAfter(game, move) {
  makeMove(game, move);
  const suffix = moveSuffix(game);
  undoMove(game);
  return suffix;
}

function formatMateLine(move, number) {
  return moveText(move, number, '#');
}

export function solveMateInTwo(fen) {
  const play = [];
  const setPlay = [];
  const tries = [];
  const position = new Chess(turnFen(fen, 'w'));
  const mateFinder = createMateMoveFinder();
  const matingMoves = mateFinder.matingMoves;

  const setPosition = new Chess(turnFen(fen, 'b'));
  for (const defense of orderedMoves(legalMoves(setPosition))) {
    makeMove(setPosition, defense);
    const replies = matingMoves(setPosition);
    if (replies.length) {
      setPlay.push('      ' + moveText(defense, 1, moveSuffix(setPosition)));
      replies.forEach((reply) => setPlay.push('          ' + formatMateLine(reply, 2)));
    }
    undoMove(setPosition);
  }

  const solvedFirstMoves = [];
  const tryFirstMoves = [];
  for (const firstMove of legalMoves(position)) {
    makeMove(position, firstMove);
    const givesCheck = position.isCheck();
    const branches = [];
    let unanswered = 0;
    const defenses = legalMoves(position);
    let rejectedEarly = false;
    for (const defense of defenses) {
      makeMove(position, defense);
      const hasMate = mateFinder.hasMatingMove(position);
      undoMove(position);
      if (!hasMate) unanswered += 1;
      branches.push({ defense, hasMate });
      // A non-checking move cannot be a Try, and one refutation is enough to
      // disprove a Key. A checking Try can have exactly one refutation, so
      // continue only until a second one rules it out.
      if (!hasMate && (!givesCheck || unanswered > 1)) {
        rejectedEarly = true;
        break;
      }
    }
    if (!rejectedEarly && branches.length === defenses.length && unanswered === 0) {
      branches.sort((a, b) => compareMoves(a.defense, b.defense));
      solvedFirstMoves.push({ firstMove, branches });
    } else if (!rejectedEarly && branches.length === defenses.length && givesCheck && unanswered === 1) {
      branches.sort((a, b) => compareMoves(a.defense, b.defense));
      tryFirstMoves.push({ firstMove, branches });
    }
    undoMove(position);
  }

  solvedFirstMoves.forEach(({ firstMove, branches }) => {
    const afterKey = new Chess(position.fen());
    makeMove(afterKey, firstMove);
    const threatPosition = new Chess(turnFen(afterKey.fen(), 'w'));
    const threats = matingMoves(threatPosition);
    const threatMoves = new Set(threats.map(({ from, to, promotion }) => `${from}${to}${promotion || ''}`));
    play.push(`   ${moveText(firstMove, 1, ' !')} threat:`);
    threats.forEach((threat) => play.push('          ' + formatMateLine(threat, 2)));
    branches.forEach(({ defense }) => {
      makeMove(afterKey, defense);
      const replies = matingMoves(afterKey);
      undoMove(afterKey);
      const threatStillWorks = replies.some(({ from, to, promotion }) => threatMoves.has(`${from}${to}${promotion || ''}`));
      if (threatStillWorks) return;
      pushReplies(play, afterKey, defense, replies);
    });
  });

  tryFirstMoves.forEach(({ firstMove, branches }) => {
    tries.push(`   ${moveText(firstMove, 1, ' + ?')}`);
    const refutations = [];
    const afterFirst = positionAfter(position, firstMove);
    branches.forEach(({ defense }) => {
      makeMove(afterFirst, defense);
      const replies = matingMoves(afterFirst);
      undoMove(afterFirst);
      if (replies.length) pushReplies(tries, positionAfter(position, firstMove), defense, replies);
      else refutations.push(defense);
    });
    if (refutations.length) {
      tries.push('    but');
      refutations.forEach((defense) => {
        const game = positionAfter(position, firstMove);
        tries.push('      ' + moveText(defense, 1, moveSuffixAfter(game, defense) + ' !'));
      });
    }
  });

  return { setPlay, play, tries };
}

function positionAfter(position, move) {
  const game = new Chess(position.fen());
  makeMove(game, move);
  return game;
}
