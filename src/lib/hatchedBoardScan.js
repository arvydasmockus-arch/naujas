import { extractTiles, rgbaToGray } from '../../node_modules/@scoriiu/fenshot/dist/tiles.js';
import { probsToPlacement } from '../../node_modules/@scoriiu/fenshot/dist/fen.js';
import { findChessboardCorners, snapCorners } from '../../node_modules/@scoriiu/fenshot/dist/detect.js';

let sessionPromise;
let ortPromise;

function getOrt(wasmPaths) {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web/wasm').then((ort) => {
      ort.env.wasm.wasmPaths = wasmPaths;
      // A fixed single-threaded runtime avoids OS-dependent worker/SIMD
      // scheduling differences when classifying small, low-confidence tiles.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      return ort;
    });
  }
  return ortPromise;
}

export async function prepareHatchedOcr(wasmPaths) {
  await getOrt(wasmPaths);
}

async function getSession(modelUrl, wasmPaths) {
  if (!sessionPromise) {
    sessionPromise = getOrt(wasmPaths).then(async (ort) => {
      const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
      return { ort, session };
    });
  }
  return sessionPromise;
}

function hasBothKings(placement) {
  return [...placement].filter((piece) => piece === 'K').length === 1
    && [...placement].filter((piece) => piece === 'k').length === 1;
}

export function findStripedGrid(gray) {
  const scale = Math.min(1, 480 / Math.max(gray.width, gray.height));
  const width = Math.max(1, Math.round(gray.width * scale));
  const height = Math.max(1, Math.round(gray.height * scale));
  let data = gray.data;
  if (scale < 1) {
    data = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(gray.width - 1, Math.floor((x + 0.5) / scale));
        const sourceY = Math.min(gray.height - 1, Math.floor((y + 0.5) / scale));
        data[y * width + x] = gray.data[sourceY * gray.width + sourceX];
      }
    }
  }
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += data[(y - 1) * width + x - 1] < 190 ? 1 : 0;
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }

  const rectSum = (x, y, w, h) => integral[(y + h) * stride + x + w]
    - integral[y * stride + x + w] - integral[(y + h) * stride + x] + integral[y * stride + x];
  const minimum = Math.min(width, height);
  let best = null;

  const minSquare = Math.ceil(minimum * 0.6 / 8);
  const maxSquare = Math.floor(minimum / 8);
  const evaluate = (square, x0, y0) => {
    const patch = Math.max(4, Math.round(square * 0.13));
    const margin = Math.max(2, Math.round(square * 0.08));
    const inner = square - margin - patch;
    const offsets = [margin, inner];
    let lightSquares = 0;
    let darkSquares = 0;
    for (let rank = 0; rank < 8; rank += 1) {
      const top = y0 + rank * square;
      for (let file = 0; file < 8; file += 1) {
        const left = x0 + file * square;
        const density = (
          rectSum(left + offsets[0], top + offsets[0], patch, patch)
          + rectSum(left + offsets[1], top + offsets[0], patch, patch)
          + rectSum(left + offsets[0], top + offsets[1], patch, patch)
          + rectSum(left + offsets[1], top + offsets[1], patch, patch)
        ) / (4 * patch * patch);
        if ((rank + file) % 2) darkSquares += density;
        else lightSquares += density;
      }
    }
    const score = Math.abs(lightSquares - darkSquares) / 32;
    if (!best || score > best.score) best = { score, x0, y0, square };
  };

  for (let square = minSquare; square <= maxSquare; square += 2) {
    const boardSize = square * 8;
    for (let y0 = 0; y0 <= height - boardSize; y0 += 4) {
      for (let x0 = 0; x0 <= width - boardSize; x0 += 4) evaluate(square, x0, y0);
    }
  }

  if (!best) return null;
  const coarseBest = best;
  best = null;
  for (let square = Math.max(minSquare, coarseBest.square - 2); square <= Math.min(maxSquare, coarseBest.square + 2); square += 1) {
    const boardSize = square * 8;
    for (let y0 = Math.max(0, coarseBest.y0 - 4); y0 <= Math.min(height - boardSize, coarseBest.y0 + 4); y0 += 1) {
      for (let x0 = Math.max(0, coarseBest.x0 - 4); x0 <= Math.min(width - boardSize, coarseBest.x0 + 4); x0 += 1) {
        evaluate(square, x0, y0);
      }
    }
  }

  if (!best || best.score < 0.12) return null;
  return {
    x0: best.x0 / scale,
    y0: best.y0 / scale,
    x1: (best.x0 + best.square * 8) / scale,
    y1: (best.y0 + best.square * 8) / scale,
    stripedScore: best.score,
  };
}

export async function scanHatchedBoard(source, filteredGuide, guideScale, { modelUrl, wasmPaths }) {
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = source.width;
  rawCanvas.height = source.height;
  const rawContext = rawCanvas.getContext('2d', { willReadFrequently: true });
  if (!rawContext) return null;
  rawContext.fillStyle = '#fff';
  rawContext.fillRect(0, 0, source.width, source.height);
  rawContext.drawImage(source, 0, 0, source.width, source.height);
  const rawPixels = rawContext.getImageData(0, 0, source.width, source.height);
  const rawGray = rgbaToGray(rawPixels.data, source.width, source.height);

  const guideCanvas = document.createElement('canvas');
  guideCanvas.width = filteredGuide.width;
  guideCanvas.height = filteredGuide.height;
  const guideContext = guideCanvas.getContext('2d', { willReadFrequently: true });
  if (!guideContext) return null;
  guideContext.fillStyle = '#fff';
  guideContext.fillRect(0, 0, filteredGuide.width, filteredGuide.height);
  guideContext.drawImage(filteredGuide, 0, 0, filteredGuide.width, filteredGuide.height);
  const guidePixels = guideContext.getImageData(0, 0, filteredGuide.width, filteredGuide.height);
  const guideGray = rgbaToGray(guidePixels.data, filteredGuide.width, filteredGuide.height);
  const corners = findChessboardCorners(guideGray);
  const stripedCorners = findStripedGrid(guideGray);
  if (!corners && !stripedCorners) return null;
  const snapped = corners && snapCorners(guideGray, corners);
  const candidates = [stripedCorners, corners, snapped]
    .filter(Boolean)
    .filter((box, index, boxes) => index === 0 || box.x0 !== boxes[0].x0 || box.y0 !== boxes[0].y0
      || box.x1 !== boxes[0].x1 || box.y1 !== boxes[0].y1)
    .map((box) => ({
      x0: box.x0 * guideScale.scaleX,
      y0: box.y0 * guideScale.scaleY,
      x1: box.x1 * guideScale.scaleX,
      y1: box.y1 * guideScale.scaleY,
      stripedScore: box.stripedScore,
    }));
  const batch = new Float32Array(candidates.length * 64 * 1024);
  candidates.forEach((box, index) => batch.set(extractTiles(rawGray, box), index * 64 * 1024));
  const { ort, session } = await getSession(modelUrl, wasmPaths);
  const output = await session.run({ tiles: new ort.Tensor('float32', batch, [candidates.length * 64, 1024]) });
  let best = null;
  let bestStriped = null;
  candidates.forEach((corners, index) => {
    const start = index * 64 * 13;
    const result = probsToPlacement(output.probs.data.subarray(start, start + 64 * 13));
    if (!hasBothKings(result.placement)) return;
    const candidate = {
      ...result,
      corners,
      stripedScore: corners.stripedScore,
      reliable: result.minConfidence >= 0.7,
      plausible: true,
    };
    if (corners.stripedScore >= 0.12 && result.meanConfidence >= 0.82
      && (!bestStriped || result.meanConfidence > bestStriped.meanConfidence)) bestStriped = candidate;
    if (!best || result.meanConfidence > best.meanConfidence
      || (result.meanConfidence === best.meanConfidence && result.minConfidence > best.minConfidence)) {
      best = candidate;
    }
  });

  return bestStriped || best;
}
