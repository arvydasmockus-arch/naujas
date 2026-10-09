import { Buffer } from 'node:buffer';
import logo from './assets/ml-academy-logo.bin';
import bB from './assets/bB.txt';
import bK from './assets/bK.txt';
import bN from './assets/bN.txt';
import bP from './assets/bP.txt';
import bQ from './assets/bQ.txt';
import bR from './assets/bR.txt';
import wB from './assets/wB.txt';
import wK from './assets/wK.txt';
import wN from './assets/wN.txt';
import wP from './assets/wP.txt';
import wQ from './assets/wQ.txt';
import wR from './assets/wR.txt';

export const pdfAssets = {
  logo: Buffer.from(logo),
  pieces: { bB, bK, bN, bP, bQ, bR, wB, wK, wN, wP, wQ, wR },
};
