import { parentPort, workerData } from 'node:worker_threads';
import { verifyPuzzle } from './puzzleTools.mjs';
parentPort.postMessage(verifyPuzzle(workerData));
