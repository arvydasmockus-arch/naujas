import { extractTiles, rgbaToGray } from '../../node_modules/@scoriiu/fenshot/dist/tiles.js';
import { probsToPlacement } from '../../node_modules/@scoriiu/fenshot/dist/fen.js';

let sessionPromise;

async function getSession(modelUrl, wasmPaths) {
  if (!sessionPromise) {
    sessionPromise = import('onnxruntime-web/wasm').then(async (ort) => {
      ort.env.wasm.wasmPaths = wasmPaths;
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

function makeGridCandidates(width, height, detectedCorners) {
  const minDimension = Math.min(width, height);
  const detectedWidth = detectedCorners.x1 - detectedCorners.x0;
  const detectedHeight = detectedCorners.y1 - detectedCorners.y0;
  const estimatedSide = (detectedWidth + detectedHeight) / 2;
  const isUsefulEstimate = estimatedSide >= minDimension * 0.78
    && estimatedSide <= minDimension * 1.04;
  const sideRatios = isUsefulEstimate
    ? [0.94, 0.97, 1, 1.03, 1.06]
    : [0.86, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98];
  const offsets = isUsefulEstimate ? [-0.04, -0.02, 0, 0.02, 0.04] : [-0.05, -0.025, 0, 0.025, 0.05];
  const baseSide = isUsefulEstimate ? estimatedSide : minDimension;
  const candidates = [];

  for (const ratio of sideRatios) {
    const side = baseSide * ratio;
    if (side < minDimension * 0.72 || side > minDimension * 1.04) continue;
    const centeredX = (width - side) / 2;
    const centeredY = (height - side) / 2;
    for (const offsetX of offsets) for (const offsetY of offsets) {
      const x0 = centeredX + side * offsetX;
      const y0 = centeredY + side * offsetY;
      if (x0 < 0 || y0 < 0 || x0 + side > width || y0 + side > height) continue;
      candidates.push({ x0, y0, x1: x0 + side, y1: y0 + side });
    }
  }
  return candidates;
}

export async function scanHatchedBoard(source, detectedCorners, { modelUrl, wasmPaths }) {
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const gray = rgbaToGray(pixels.data, width, height);
  const candidates = makeGridCandidates(width, height, {
    x0: detectedCorners.x0 * scale,
    y0: detectedCorners.y0 * scale,
    x1: detectedCorners.x1 * scale,
    y1: detectedCorners.y1 * scale,
  });
  if (candidates.length < 2) return null;

  const batch = new Float32Array(candidates.length * 64 * 1024);
  candidates.forEach((corners, index) => batch.set(extractTiles(gray, corners), index * 64 * 1024));
  const { ort, session } = await getSession(modelUrl, wasmPaths);
  const output = await session.run({ tiles: new ort.Tensor('float32', batch, [candidates.length * 64, 1024]) });
  let best = null;
  candidates.forEach((corners, index) => {
    const start = index * 64 * 13;
    const result = probsToPlacement(output.probs.data.subarray(start, start + 64 * 13));
    if (!hasBothKings(result.placement)) return;
    if (!best || result.meanConfidence > best.meanConfidence
      || (result.meanConfidence === best.meanConfidence && result.minConfidence > best.minConfidence)) {
      best = {
        ...result,
        corners: {
          x0: corners.x0 / scale,
          y0: corners.y0 / scale,
          x1: corners.x1 / scale,
          y1: corners.y1 / scale,
        },
        reliable: result.minConfidence >= 0.7,
        plausible: true,
      };
    }
  });
  return best;
}
