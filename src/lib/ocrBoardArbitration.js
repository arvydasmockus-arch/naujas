function pieceCount(placement) {
  return (placement || '').replace(/[1-8/]/g, '').length;
}

export function isFullBoardRead(result, source) {
  if (!result?.corners) return false;
  const { x0, y0, x1, y1 } = result.corners;
  const width = x1 - x0;
  const height = y1 - y0;
  const sourceMin = Math.min(source.width, source.height);
  return Math.min(width, height) >= sourceMin * 0.82
    && Math.min(width, height) / Math.max(width, height) >= 0.88;
}

export function gridRecoversRead(primary, candidate, source) {
  if (!candidate?.plausible) return false;
  const candidateIsFull = isFullBoardRead(candidate, source);
  const primaryIsFull = isFullBoardRead(primary, source);
  // A strong, full grid read can replace a partial or implausible read.
  // If both cover the full board, compare their confidence below instead
  // of preferring one merely because the placements differ.
  if (candidateIsFull && candidate.meanConfidence >= 0.82 && !primaryIsFull) return true;
  return !primary?.plausible
    || candidate.meanConfidence > primary.meanConfidence
    || (candidate.meanConfidence === primary.meanConfidence && candidate.minConfidence > primary.minConfidence)
    || (candidate.meanConfidence >= 0.78 && candidate.meanConfidence >= primary.meanConfidence
      && pieceCount(candidate.placement) >= pieceCount(primary?.placement) + 4);
}
