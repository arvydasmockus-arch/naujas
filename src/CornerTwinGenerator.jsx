import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import './CornerTwinGenerator.css';

const MAX_ATTEMPTS = 2_000_000;

const pieceImages = Object.fromEntries(Object.entries(import.meta.glob('./assets/chess/*.svg', { eager: true, query: '?url', import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]));

const text = {
  lt: {
    title: 'Aštuonių kampų H#2 generatorius', intro: 'Ieško vienos pozicijos, kurioje žirgas ir rikis kiekviename kampe duoda po vieną H#2.',
    count: 'Kiek rinkinių rasti', start: 'Ieškoti pozicijų', stop: 'Stabdyti', running: 'Tikrinamos 8 pozicijos kiekviename rinkinyje…', attempts: 'Patikrinta pagrindinių pozicijų', found: 'Rasta rinkinių', checkingPosition: 'Kuriama nauja pozicija', checkingVariant: 'Tikrinamas variantas',
    base: 'Pagrindinė pozicija be kampinės figūros', variants: 'Aštuoni variantai', copy: 'Kopijuoti FEN', copied: 'Nukopijuota', knight: 'Žirgas', bishop: 'Rikis', line: 'Sprendimas', note: 'Rinkinys rodomas tik tada, kai kiekvienas variantas turi lygiai vieną sprendimą ir visos baltos figūros dalyvauja mate. Kampinė figūra keičiama į žirgą arba rikį; likusi pozicija išlieka ta pati.', exhausted: 'Paieška baigėsi. Padidinkite rinkinių skaičių arba bandykite dar kartą.', error: 'Generatoriaus klaida'
  },
  en: {
    title: 'Eight-corner H#2 generator', intro: 'Searches for a position where a knight and bishop in each corner each have one H#2 solution.',
    count: 'Sets to find', start: 'Search positions', stop: 'Stop', running: 'Checking all 8 positions in each set…', attempts: 'Base positions checked', found: 'Sets found', checkingPosition: 'Creating a new position', checkingVariant: 'Checking variant',
    base: 'Base position without the corner piece', variants: 'Eight variants', copy: 'Copy FEN', copied: 'Copied', knight: 'Knight', bishop: 'Bishop', line: 'Solution', note: 'A set appears only when every variant has exactly one solution and all White pieces participate in the mate. The corner piece changes to a knight or bishop; the rest of the position stays fixed.', exhausted: 'Search finished. Increase the number of sets or try again.', error: 'Generator error'
  }
};

function boardFromFen(fen) {
  return new Chess(fen).board().map((rank) => rank.map((piece) => piece ? piece.color + piece.type.toUpperCase() : null));
}

function Diagram({ fen }) {
  const board = boardFromFen(fen);
  return <div className="corner-twin__board">{board.flatMap((rank, y) => rank.map((piece, x) => <div className={(x + y) % 2 ? 'is-dark' : 'is-light'} key={`${x}-${y}`}>{piece && <img src={pieceImages[piece]} alt="" />}</div>))}</div>;
}

export default function CornerTwinGenerator({ language = 'en' }) {
  const t = text[language] || text.en;
  const [targetCount, setTargetCount] = useState(1);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({ attempts: 0, found: 0, maxAttempts: MAX_ATTEMPTS });
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const workerRef = useRef(null);
  const runIdRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  function start() {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./cornerTwinGeneratorWorker.js', import.meta.url), { type: 'module' });
    const runId = Date.now() + Math.random();
    runIdRef.current = runId;
    workerRef.current = worker;
    setCandidates([]);
    setProgress({ attempts: 0, found: 0, maxAttempts: MAX_ATTEMPTS });
    setError('');
    setStatus('running');
    worker.onmessage = ({ data }) => {
      if (data.runId !== runIdRef.current) return;
      if (data.type === 'candidate') setCandidates((old) => [...old, data.candidate]);
      if (data.type === 'progress') setProgress(data);
      if (data.type === 'complete') { setProgress(data); setStatus('complete'); worker.terminate(); workerRef.current = null; }
      if (data.type === 'error') { setError(data.message); setStatus('error'); worker.terminate(); workerRef.current = null; }
    };
    worker.onerror = (event) => { setError(event.message || t.error); setStatus('error'); worker.terminate(); workerRef.current = null; };
    worker.postMessage({ type: 'generate', runId, targetCount: Math.min(20, Math.max(1, Number(targetCount) || 1)), maxAttempts: MAX_ATTEMPTS, wasmUrl: import.meta.env.BASE_URL + 'popeye/py.wasm' });
  }

  function stop() {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel', runId: runIdRef.current });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('complete');
  }

  async function copyFen(fen, key) {
    await navigator.clipboard?.writeText(fen);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1500);
  }

  return <main className="corner-twin">
    <header className="corner-twin__header"><div><h1>{t.title}</h1><p>{t.intro}</p></div></header>
    <section className="corner-twin__controls">
      <label>{t.count}<select value={targetCount} disabled={status === 'running'} onChange={(event) => setTargetCount(Number(event.target.value))}>{[1, 2, 3, 5, 10, 20].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
      <button type="button" onClick={status === 'running' ? stop : start}>{status === 'running' ? t.stop : t.start}</button>
      <p>{t.note}</p>
      {error && <p role="alert" className="corner-twin__error">{error}</p>}
      {status === 'running' && <div className="corner-twin__progress"><span>{t.running}</span><progress max={progress.maxAttempts} value={progress.attempts} /><small>{t.attempts}: {progress.attempts} / {progress.maxAttempts} · {t.found}: {progress.found}</small><small>{progress.stage === 'variant' ? `${t.checkingVariant} ${progress.variant}/8` : t.checkingPosition}</small></div>}
      {status === 'complete' && candidates.length === 0 && <p>{t.exhausted}</p>}
    </section>
    {candidates.map((candidate) => <section className="corner-twin__result" key={candidate.number}>
      <div className="corner-twin__result-header"><div><h2>{t.variants} {candidate.number}</h2><p>{t.base}</p></div><button type="button" onClick={() => copyFen(candidate.baseFen, `base-${candidate.number}`)}>{copied === `base-${candidate.number}` ? t.copied : t.copy}</button></div>
      <div className="corner-twin__base"><Diagram fen={candidate.baseFen} /><code>{candidate.baseFen.split(' ')[0]}</code></div>
      <div className="corner-twin__variants">{candidate.variants.map((variant) => <article className="corner-twin__variant" key={variant.label + variant.piece}>
        <h3>{variant.label} {variant.piece === 'knight' ? t.knight : t.bishop} {variant.square}</h3>
        <Diagram fen={variant.fen} />
        <code>{variant.fen.split(' ')[0]}</code>
        <pre>{variant.groups.play.map((line) => line.trim()).join('\n')}</pre>
      </article>)}</div>
    </section>)}
  </main>;
}
