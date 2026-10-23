import { parentPort, workerData } from 'node:worker_threads';
import { verifyPuzzle } from './puzzleTools.mjs';
if (workerData) parentPort.postMessage(verifyPuzzle(workerData));
else parentPort.on('message', (puzzle) => parentPort.postMessage(verifyPuzzle(puzzle)));
