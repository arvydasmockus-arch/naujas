import { extractTiles, rgbaToGray } from '../../node_modules/@scoriiu/fenshot/dist/tiles.js';
import { probsToPlacement } from '../../node_modules/@scoriiu/fenshot/dist/fen.js';
import { findChessboardCorners, snapCorners } from '../../node_modules/@scoriiu/fenshot/dist/detect.js';

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
  if (!corners) return null;
  const snapped = snapCorners(guideGray, corners);
  const candidates = [corners, snapped]
    .filter((box, index, boxes) => index === 0 || box.x0 !== boxes[0].x0 || box.y0 !== boxes[0].y0
      || box.x1 !== boxes[0].x1 || box.y1 !== boxes[0].y1)
    .map((box) => ({
      x0: box.x0 * guideScale.scaleX,
      y0: box.y0 * guideScale.scaleY,
      x1: box.x1 * guideScale.scaleX,
      y1: box.y1 * guideScale.scaleY,
    }));
  const batch = new Float32Array(candidates.length * 64 * 1024);
  candidates.forEach((box, index) => batch.set(extractTiles(rawGray, box), index * 64 * 1024));
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
        corners,
        reliable: result.minConfidence >= 0.7,
        plausible: true,
      };
    }
  });
  return best;
}
