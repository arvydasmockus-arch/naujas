const RANK = '[1-8KQRBNPkqrbnp]+';
const PLACEMENT = `${RANK}(?:/${RANK}){7}`;

/** Find a FEN position copied with surrounding labels or YACPDB metadata. */
export function extractPositionText(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.replace(/\u00a0/g, ' ').trim();
  const pattern = new RegExp(`(?:^|[^1-8KQRBNPkqrbnp/])(${PLACEMENT})(?:\\s+([wb])(?:\\s+([KQkq-]+))?(?:\\s+([a-h][1-8]|-))?(?:\\s+(\\d+))?(?:\\s+(\\d+))?)?(?=$|[^1-8KQRBNPkqrbnp/])`, 'g');
  const match = pattern.exec(text);
  if (!match) return '';
  if (!match[2]) return match[1];
  return [match[1], match[2], match[3] || '-', match[4] || '-', match[5] || '0', match[6] || '1'].join(' ');
}
