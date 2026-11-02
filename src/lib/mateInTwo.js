import { Chess } from 'chess.js';

const pieceNames = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'S' };
const moveOrder = { r: 0, n: 1, p: 2, q: 3, b: 4, k: 5 };

function orderedMoves(moves) {
  return [...moves].sort((a, b) => (moveOrder[a.piece] ?? 6) - (moveOrder[b.piece] ?? 6)
    || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
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
  function hasMatingMove(game) {
    const fen = game.fen();
    if (cache.has(fen)) return cache.get(fen).length > 0;
    for (const move of game.moves({ verbose: true })) {
      game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      // Most legal moves are not checks. Avoid generating the opponent's
      // legal replies unless the move actually gives check.
      const isMate = game.isCheck() && game.isCheckmate();
      game.undo();
      if (isMate) {
        cache.set(fen, [move]);
        return true;
      }
    }
    cache.set(fen, []);
    return false;
  }
  function matingMoves(game) {
    const fen = game.fen();
    if (cache.has(fen) && cache.get(fen).length === 0) return [];
    if (cache.has(fen) && cache.get(fen).length > 1) return cache.get(fen);
    const first = cache.get(fen) || [];
    const found = [...first];
    for (const move of game.moves({ verbose: true })) {
      const moveKey = `${move.from}${move.to}${move.promotion || ''}`;
      if (found.some((candidate) => `${candidate.from}${candidate.to}${candidate.promotion || ''}` === moveKey)) continue;
      game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      const isMate = game.isCheck() && game.isCheckmate();
      game.undo();
      if (isMate) found.push(move);
    }
    cache.set(fen, found);
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
  game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  const suffix = moveSuffix(game);
  game.undo();
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
  for (const defense of orderedMoves(setPosition.moves({ verbose: true }))) {
    setPosition.move({ from: defense.from, to: defense.to, ...(defense.promotion ? { promotion: defense.promotion } : {}) });
    const replies = matingMoves(setPosition);
    if (replies.length) {
      setPlay.push('      ' + moveText(defense, 1, moveSuffix(setPosition)));
      replies.forEach((reply) => setPlay.push('          ' + formatMateLine(reply, 2)));
    }
    setPosition.undo();
  }

  const solvedFirstMoves = [];
  const tryFirstMoves = [];
  for (const firstMove of position.moves({ verbose: true })) {
    position.move({ from: firstMove.from, to: firstMove.to, ...(firstMove.promotion ? { promotion: firstMove.promotion } : {}) });
    const givesCheck = position.isCheck();
    const branches = [];
    let unanswered = 0;
    for (const defense of orderedMoves(position.moves({ verbose: true }))) {
      position.move({ from: defense.from, to: defense.to, ...(defense.promotion ? { promotion: defense.promotion } : {}) });
      const hasMate = mateFinder.hasMatingMove(position);
      position.undo();
      if (!hasMate) unanswered += 1;
      branches.push({ defense, hasMate });
    }
    if (branches.length && unanswered === 0) solvedFirstMoves.push({ firstMove, branches });
    else if (givesCheck && unanswered === 1) tryFirstMoves.push({ firstMove, branches });
    position.undo();
  }

  solvedFirstMoves.forEach(({ firstMove, branches }) => {
    const afterKey = new Chess(position.fen());
    afterKey.move({ from: firstMove.from, to: firstMove.to, ...(firstMove.promotion ? { promotion: firstMove.promotion } : {}) });
    const threatPosition = new Chess(turnFen(afterKey.fen(), 'w'));
    const threats = matingMoves(threatPosition);
    const threatMoves = new Set(threats.map(({ from, to, promotion }) => `${from}${to}${promotion || ''}`));
    play.push(`   ${moveText(firstMove, 1, ' !')} threat:`);
    threats.forEach((threat) => play.push('          ' + formatMateLine(threat, 2)));
    branches.forEach(({ defense }) => {
      afterKey.move({ from: defense.from, to: defense.to, ...(defense.promotion ? { promotion: defense.promotion } : {}) });
      const replies = matingMoves(afterKey);
      afterKey.undo();
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
      afterFirst.move({ from: defense.from, to: defense.to, ...(defense.promotion ? { promotion: defense.promotion } : {}) });
      const replies = matingMoves(afterFirst);
      afterFirst.undo();
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
  game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  return game;
}
