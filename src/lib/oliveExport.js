import { Chess } from 'chess.js';

const olivePiece = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'S', p: 'P' };

function quoteYaml(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function algebraicPieces(fen, color) {
  const game = new Chess(fen);
  return game.board().flatMap((rank, row) => rank.flatMap((piece, file) => {
    if (!piece || piece.color !== color) return [];
    return [`${olivePiece[piece.type]}${'abcdefgh'[file]}${8 - row}`];
  }));
}

export function exportOliveCollection(positions) {
  return [...positions].sort((a, b) => a.number - b.number).map((position) => {
    const white = algebraicPieces(position.fen, 'w');
    const black = algebraicPieces(position.fen, 'b');
    const turn = position.fen.split(/\s+/)[1] === 'b' ? 'black' : 'white';
    return [
      '---',
      'algebraic:',
      `  black: [${black.join(', ')}]`,
      `  white: [${white.join(', ')}]`,
      `comments: [${quoteYaml(`ML Academy #${position.number}; ${turn} to move; FEN: ${position.fen}`)}]`,
      `stipulation: ${quoteYaml(position.stipulation)}`,
      "solution: ''",
    ].join('\n');
  }).join('\n') + (positions.length ? '\n' : '');
}
