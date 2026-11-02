import { solveMateInTwo } from './lib/mateInTwo.js';

self.onmessage = ({ data }) => {
  if (data?.type !== 'solve') return;
  try {
    const groups = solveMateInTwo(data.fen);
    self.postMessage({ type: 'solution', groups });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
