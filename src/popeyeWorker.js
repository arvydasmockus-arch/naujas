import createPopeye from './lib/popeye/py.js';
import { buildPopeyeInput, parsePopeyeOutput } from './lib/popeyeSolver.js';

let modulePromise;
self.onmessage = async ({ data }) => {
  if (data?.type !== 'solve') return;
  try {
    const stipulation = data.stipulation || '#2';
    const input = buildPopeyeInput(data.fen, stipulation);
    const output = [];
    if (!modulePromise) modulePromise = createPopeye({ noInitialRun: true, locateFile: () => data.wasmUrl,
      print: (text) => output.push(text),
      printErr: (text) => output.push(text) });
    const popeye = await modulePromise;
    popeye.FS.writeFile('/ml-academy.inp', `BeginProblem\n${input}\nEndProblem`);
    popeye.callMain(['-maxmem', '512M', '/ml-academy.inp']);
    const raw = output.join('\n');
    if (/input-error:|both sides need a king|no stipulation specified/i.test(raw)) {
      throw new Error(raw.split('\n').find((line) => /input-error:|both sides need a king|no stipulation specified/i.test(line)) || 'Popeye could not read this position.');
    }
    self.postMessage({ type: 'solution', groups: parsePopeyeOutput(raw, stipulation), raw, stipulation });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
