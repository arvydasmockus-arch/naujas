const MAX_MATE_LENGTH = 99;

export function parseStipulation(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(#|h#?|s#?)(\d{1,2})$/);
  if (!match) throw new Error('Enter a stipulation such as #6, h3 or s3.');
  const type = match[1] === 'h' || match[1] === 'h#' ? 'h#' : match[1] === 's' || match[1] === 's#' ? 's#' : '#';
  const moves = Number(match[2]);
  if (!Number.isInteger(moves) || moves < 1 || moves > MAX_MATE_LENGTH) {
    throw new Error(`Mate length must be between 1 and ${MAX_MATE_LENGTH}.`);
  }
  return { type, moves, normalized: type === '#' ? `#${moves}` : `${type}${moves}` };
}

export function buildPopeyeInput(fen, stipulation) {
  const parsed = parseStipulation(stipulation);

  const board = String(fen || '').trim().split(/\s+/)[0];
  if (!board || board.split('/').length !== 8) throw new Error('Invalid board position.');

  // Popeye calls knights S (Springer); N is a nightrider. Feeding FEN's N/n
  // directly was the source of false keys such as Ne2-c1 in the tested #2.
  const popeyeBoard = board.replace(/[Nn]/g, (piece) => piece === 'N' ? 'S' : 's');
  return [
    'Stipulation ' + parsed.normalized,
    'Forsyth ' + popeyeBoard,
    'Option MoveNumbers Try Set Variation',
  ].join('\n');
}

export function parsePopeyeOutput(output, stipulation = '#2') {
  const { type } = parseStipulation(stipulation);
  const groups = { setPlay: [], play: [], tries: [] };
  let inSetPlay = true;
  let activePhase = null;

  for (const line of String(output || '').replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    if (/^\s*\d+\s+\([^)]*Time\s*=/.test(line)) {
      inSetPlay = false;
      activePhase = null;
      continue;
    }

    if (inSetPlay) {
      if (/^\s*1\.\.\./.test(line) || /^\s+2\./.test(line)) groups.setPlay.push(line);
      continue;
    }

    const whiteRoot = /^\s*1\.(?!\.)/.test(line);
    const blackRoot = /^\s*1\.\.\./.test(line);
    if (whiteRoot || (blackRoot && type === 'h#')) {
      activePhase = line.includes('?') ? 'tries' : line.includes('!') || type !== '#' ? 'play' : null;
    }
    if (activePhase && (/^\s*\d+\./.test(line) || /^\s*but\s*$/.test(line) || /threat:/.test(line))) groups[activePhase].push(line);
  }

  return groups;
}
