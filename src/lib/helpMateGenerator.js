export function getKeyMove(line) {
  if (!/^\s*1\.(?!\.)/.test(line)) return null;
  return line.match(/\b([KQRBSN]?[a-h][1-8][-*x][a-h][1-8](?:[QRBSN])?)/)?.[1] || null;
}

export function getLineMoves(line) {
  return [...line.matchAll(/([KQRBSN]?[a-h][1-8][-*x][a-h][1-8](?:[QRBSN])?)/g)].map((match) => match[1]);
}

export function getBlackNonKingSquares(fen) {
  const rows = String(fen || '').split(/\s+/)[0].split('/');
  if (rows.length !== 8) return [];
  const squares = [];
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    let file = 0;
    for (const symbol of rows[rowIndex]) {
      if (/^[1-8]$/.test(symbol)) { file += Number(symbol); continue; }
      if (symbol === symbol.toLowerCase() && symbol !== 'k') squares.push(`${String.fromCharCode(97 + file)}${8 - rowIndex}`);
      file += 1;
    }
  }
  return squares;
}

export function removeFenPiece(fen, square) {
  const parts = String(fen || '').trim().split(/\s+/);
  const ranks = parts[0]?.split('/');
  if (ranks?.length !== 8 || !/^[a-h][1-8]$/.test(square || '')) return null;
  const file = square.charCodeAt(0) - 97;
  const rowIndex = 8 - Number(square[1]);
  const cells = ranks.map((rank) => {
    const expanded = [];
    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) expanded.push(...Array(Number(symbol)).fill(null));
      else expanded.push(symbol);
    }
    return expanded;
  });
  const piece = cells[rowIndex]?.[file];
  if (!piece || piece === piece.toUpperCase() || piece === 'k') return null;
  cells[rowIndex][file] = null;
  const placement = cells.map((row) => {
    let output = '';
    let empty = 0;
    for (const cell of row) {
      if (!cell) { empty += 1; continue; }
      if (empty) output += empty;
      output += cell;
      empty = 0;
    }
    if (empty) output += empty;
    return output;
  }).join('/');
  return [placement, ...parts.slice(1)].join(' ');
}

export function hasSameCompleteSolution(left, right) {
  const signatures = (groups) => new Set((groups?.play || [])
    .filter((line) => line.includes('#'))
    .map((line) => getLineMoves(line).join(' '))
    .filter(Boolean));
  const leftSolutions = signatures(left);
  return [...signatures(right)].some((solution) => leftSolutions.has(solution));
}

export function hasSameSolutionSet(left, right) {
  const signatures = (groups) => new Set((groups?.play || [])
    .filter((line) => line.includes('#'))
    .map((line) => getLineMoves(line).join(' '))
    .filter(Boolean));
  const leftSolutions = signatures(left);
  const rightSolutions = signatures(right);
  return leftSolutions.size === rightSolutions.size
    && [...leftSolutions].every((solution) => rightSolutions.has(solution));
}

export function getBlackPieceCountRange(minimumCount, whiteCount, selectedPieces) {
  const limits = { Q: 1, R: 2, B: 2, N: 2, P: 8 };
  const pieceCapacity = [...new Set(selectedPieces || [])].reduce((sum, piece) => sum + (limits[piece] || 0), 0);
  const maximum = Math.min(16, 32 - whiteCount, 1 + pieceCapacity);
  return maximum < minimumCount ? null : { minimum: minimumCount, maximum };
}

function getSolutionMoveRecords(line, fen) {
  const rows = String(fen || '').split(/\s+/)[0].split('/');
  if (rows.length !== 8) return [];
  const board = new Map();
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    let file = 0;
    for (const symbol of rows[rowIndex]) {
      if (/^[1-8]$/.test(symbol)) { file += Number(symbol); continue; }
      const square = `${String.fromCharCode(97 + file)}${8 - rowIndex}`;
      board.set(square, { color: symbol === symbol.toUpperCase() ? 'w' : 'b', type: symbol.toLowerCase(), id: square });
      file += 1;
    }
  }
  const records = [];
  for (const move of getLineMoves(line)) {
    const parsed = move.match(/^(?:[KQRBSN])?([a-h][1-8])[-*x]([a-h][1-8])(?:[QRBSN])?$/);
    if (!parsed) return [];
    const [, from, to] = parsed;
    const piece = board.get(from);
    if (!piece) return [];
    records.push({ ...piece, from, to });
    board.delete(from);
    board.delete(to);
    board.set(to, piece);
  }
  return records;
}

export function getIdealHelpmateTwinLevel(groups, fen) {
  const solutions = (groups?.play || []).filter((line) => line.includes('#'))
    .map((line) => getSolutionMoveRecords(line, fen)).filter((moves) => moves.length);
  for (let leftIndex = 0; leftIndex < solutions.length; leftIndex += 1) {
    const left = solutions[leftIndex];
    const leftWhite = left.filter((move) => move.color === 'w');
    const leftBlack = left.filter((move) => move.color === 'b');
    const leftMate = leftWhite.at(-1);
    if (!leftMate || !leftBlack.length) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < solutions.length; rightIndex += 1) {
      const right = solutions[rightIndex];
      const rightWhite = right.filter((move) => move.color === 'w');
      const rightBlack = right.filter((move) => move.color === 'b');
      const rightMate = rightWhite.at(-1);
      if (!rightMate || !rightBlack.length || leftMate.to !== rightMate.to || leftMate.id === rightMate.id) continue;
      const whitePiecesMeet = leftWhite.slice(0, -1).some((leftMove) => rightWhite.slice(0, -1)
        .some((rightMove) => leftMove.to === rightMove.to && leftMove.id !== rightMove.id));
      const blackPiecesMeet = leftBlack.some((leftMove) => rightBlack
        .some((rightMove) => leftMove.to === rightMove.to && leftMove.id !== rightMove.id));
      if (!whitePiecesMeet) continue;
      if (blackPiecesMeet) return 2;
      if (leftBlack.at(-1).id !== rightBlack.at(-1).id) return 1;
    }
  }
  return 0;
}

export function hasIdealHelpmateTwinTheme(groups, fen) {
  return getIdealHelpmateTwinLevel(groups, fen) > 0;
}

export function countKeyMoves(groups) {
  const solutions = groups.play.filter((line) => line.includes('#'))
    .map((line) => getLineMoves(line).join(' ')).filter(Boolean);
  return new Set(solutions).size;
}

function getMovesByColor(line, fen) {
  const moves = getLineMoves(line);
  if (!fen) {
    const startsWithBlack = /^\s*1\.\.\./.test(line);
    return {
      whiteMoves: moves.filter((_, index) => (index % 2 === 0) !== startsWithBlack),
      blackMoves: moves.filter((_, index) => (index % 2 === 0) === startsWithBlack),
    };
  }
  const board = new Map();
  const rows = fen.split(' ')[0].split('/');
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    let file = 0;
    for (const symbol of rows[rowIndex] || '') {
      if (/^[1-8]$/.test(symbol)) { file += Number(symbol); continue; }
      board.set(`${String.fromCharCode(97 + file)}${8 - rowIndex}`, symbol === symbol.toUpperCase() ? 'w' : 'b');
      file += 1;
    }
  }
  const colored = { whiteMoves: [], blackMoves: [] };
  for (const move of moves) {
    const parsed = move.match(/^(?:[KQRBSN])?([a-h][1-8])[-*x]([a-h][1-8])(?:[QRBSN])?$/);
    if (!parsed) continue;
    const [, from, to] = parsed;
    const color = board.get(from);
    if (!color) continue;
    colored[color === 'w' ? 'whiteMoves' : 'blackMoves'].push(move);
    board.delete(from);
    board.delete(to);
    board.set(to, color);
  }
  return colored;
}

export function hasHelpmateDual(groups, fen) {
  const variations = groups.play.map((line) => ({ ...getMovesByColor(line, fen), isMate: line.includes('#') }))
    .filter((line) => line.isMate && line.whiteMoves.length > 0 && line.blackMoves.length > 0);
  for (let left = 0; left < variations.length; left += 1) {
    for (let right = left + 1; right < variations.length; right += 1) {
      const a = variations[left];
      const b = variations[right];
      if (a.whiteMoves.join(' ') === b.whiteMoves.join(' ') && a.blackMoves.join(' ') !== b.blackMoves.join(' ')) return true;
    }
  }
  return false;
}

export function hasInitialChessMaterial(fen) {
  const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) return false;
  const limits = { q: 1, r: 2, b: 2, n: 2, p: 8 };
  const counts = { w: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 } };
  const bishopSquares = { w: [], b: [] };
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    let file = 0;
    for (const symbol of rows[rowIndex]) {
      if (/^[1-8]$/.test(symbol)) { file += Number(symbol); continue; }
      const color = symbol === symbol.toUpperCase() ? 'w' : 'b';
      const kind = symbol.toLowerCase();
      if (!(kind in counts[color]) || file >= 8) return false;
      counts[color][kind] += 1;
      if (kind === 'b') bishopSquares[color].push((file + (7 - rowIndex)) % 2);
      file += 1;
    }
    if (file !== 8) return false;
  }
  return ['w', 'b'].every((color) => counts[color].k === 1
    && Object.entries(limits).every(([kind, limit]) => counts[color][kind] <= limit)
    && Object.values(counts[color]).reduce((sum, count) => sum + count, 0) <= 16
    && (bishopSquares[color].length < 2 || new Set(bishopSquares[color]).size === bishopSquares[color].length));
}

export function hasRepeatedMatingPieceOnSameSquare(fen, groups) {
  const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) return true;
  const matesBySquare = new Map();
  let nextId = 0;
  for (const line of groups.play.filter((item) => item.includes('#'))) {
    const board = new Map();
    for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
      let file = 0;
      for (const symbol of rows[rowIndex]) {
        if (/^[1-8]$/.test(symbol)) { file += Number(symbol); continue; }
        board.set(`${String.fromCharCode(97 + file)}${8 - rowIndex}`, { color: symbol === symbol.toUpperCase() ? 'w' : 'b', type: symbol.toLowerCase(), id: nextId++ });
        file += 1;
      }
    }
    const moves = getLineMoves(line);
    for (const move of moves) {
      const parsed = move.match(/^(?:[KQRBSN])?([a-h][1-8])[-*x]([a-h][1-8])(?:[QRBSN])?$/);
      if (!parsed) return true;
      const [, from, to] = parsed;
      const piece = board.get(from);
      if (!piece) return true;
      board.delete(from);
      board.delete(to);
      board.set(to, piece);
    }
    const lastMove = moves.at(-1)?.match(/^(?:[KQRBSN])?([a-h][1-8])[-*x]([a-h][1-8])(?:[QRBSN])?$/);
    if (!lastMove) return true;
    const square = lastMove[2];
    const piece = board.get(square);
    if (!piece) return true;
    const identities = matesBySquare.get(square) || new Set();
    if (identities.has(piece.id)) return true;
    identities.add(piece.id);
    matesBySquare.set(square, identities);
    nextId = 0;
  }
  return false;
}

export function allWhitePiecesParticipate(fen, groups) {
  const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) return false;
  const initialPieces = [];
  const parseBoard = () => new Map();
  const startingBoard = parseBoard();
  for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) {
    let file = 0;
    for (const symbol of rows[rowIndex]) {
      if (/^[1-8]$/.test(symbol)) { file += Number(symbol); continue; }
      const square = `${String.fromCharCode(97 + file)}${8 - rowIndex}`;
      const piece = { color: symbol === symbol.toUpperCase() ? 'w' : 'b', type: symbol.toLowerCase(), square };
      if (piece.color === 'w' && !['k', 'p'].includes(piece.type)) { piece.id = initialPieces.length; initialPieces.push(piece); }
      startingBoard.set(square, piece);
      file += 1;
    }
  }
  if (!initialPieces.length) return false;
  const solutions = groups.play.filter((line) => line.includes('#'));
  if (!solutions.length) return false;
  return solutions.every((line) => {
    const board = new Map([...startingBoard].map(([square, piece]) => [square, { ...piece }]));
    const pieceSquares = new Map(initialPieces.map((piece) => [piece.id, piece.square]));
    const moves = getLineMoves(line);
    for (let index = 0; index < moves.length; index += 1) {
      const parsed = moves[index].match(/^(?:[KQRBSN])?([a-h][1-8])[-*x]([a-h][1-8])(?:[QRBSN])?$/);
      if (!parsed) return false;
      const [, from, to] = parsed;
      const piece = board.get(from);
      if (!piece) return false;
      const captured = board.get(to);
      if (captured?.id !== undefined) pieceSquares.delete(captured.id);
      board.delete(from);
      piece.square = to;
      board.set(to, piece);
      if (piece.id !== undefined) pieceSquares.set(piece.id, to);
    }
    const blackKing = [...board.values()].find((piece) => piece.color === 'b' && piece.type === 'k');
    if (!blackKing) return false;
    const [kingFile, kingRank] = [blackKing.square.charCodeAt(0) - 97, Number(blackKing.square[1])];
    const mateArea = [];
    for (let file = Math.max(0, kingFile - 1); file <= Math.min(7, kingFile + 1); file += 1) {
      for (let rank = Math.max(1, kingRank - 1); rank <= Math.min(8, kingRank + 1); rank += 1) {
        mateArea.push(`${String.fromCharCode(97 + file)}${rank}`);
      }
    }
    const controls = (from, target, type) => {
      if (from === target) return true;
      const dx = target.charCodeAt(0) - from.charCodeAt(0);
      const dy = Number(target[1]) - Number(from[1]);
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const diagonal = ax === ay && ax > 0;
      const straight = (dx === 0) !== (dy === 0);
      if (type === 'n') return ax * ay === 2;
      if (type === 'b' && !diagonal) return false;
      if (type === 'r' && !straight) return false;
      if (type === 'q' && !diagonal && !straight) return false;
      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);
      let file = from.charCodeAt(0) - 97 + stepX;
      let rank = Number(from[1]) + stepY;
      while (file !== target.charCodeAt(0) - 97 || rank !== Number(target[1])) {
        if (board.has(`${String.fromCharCode(97 + file)}${rank}`)) return false;
        file += stepX;
        rank += stepY;
      }
      return true;
    };
    return initialPieces.every((initialPiece) => {
      const square = pieceSquares.get(initialPiece.id);
      const finalPiece = square && board.get(square);
      return finalPiece && mateArea.some((target) => controls(square, target, finalPiece.type));
    });
  });
}

export function isGeneratedCandidate(groups, config, fen) {
  const solutions = countKeyMoves(groups);
  const filters = config.filters || ['exact-solutions', 'no-duals'];
  if (solutions === 0) return false;
  if (filters.includes('exact-solutions') && solutions !== config.solutionCount) return false;
  if (filters.includes('no-duals') && hasHelpmateDual(groups, fen)) return false;
  return true;
}
