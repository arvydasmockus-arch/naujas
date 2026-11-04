import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import './HelpMateGenerator.css';

const pieceImages = Object.fromEntries(Object.entries(import.meta.glob('./assets/chess/*.svg', { eager: true, query: '?url', import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]));
const initialConfig = { moves: 2, solutionCount: 2, candidateCount: 4, whiteCount: 7, blackCount: 7, whitePieces: ['Q', 'R', 'B', 'N', 'P'], blackPieces: ['Q', 'R', 'B', 'N', 'P'], filters: ['exact-solutions', 'ideal-twin'] };
const seenStorageKey = 'ml-h-generator-seen-positions-v1';
const maxAttempts = 100000;
const seenDbName = 'ml-h-generator';

function openSeenDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const request = window.indexedDB.open(seenDbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('positions', { keyPath: 'fen' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSeenPositions() {
  try {
    const db = await openSeenDatabase();
    const positions = await new Promise((resolve, reject) => {
      const request = db.transaction('positions', 'readonly').objectStore('positions').getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return positions;
  } catch {
    try {
      const saved = JSON.parse(localStorage.getItem(seenStorageKey) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  }
}

async function saveSeenPositions(fens) {
  if (!fens.length) return;
  try {
    const db = await openSeenDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('positions', 'readwrite');
      const store = transaction.objectStore('positions');
      fens.forEach((fen) => store.put({ fen }));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    try {
      const saved = JSON.parse(localStorage.getItem(seenStorageKey) || '[]');
      const positions = new Set(Array.isArray(saved) ? saved : []);
      fens.forEach((fen) => positions.add(fen));
      localStorage.setItem(seenStorageKey, JSON.stringify([...positions]));
    } catch { /* Generation continues even when browser storage is full. */ }
  }
}
const pieceNames = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

const copy = {
  lt: {
    title: 'H uždavinių generatorius', intro: 'Generuokite ir įvertinkite naujas pagalbinių matų pozicijas.', settings: 'Paieškos nustatymai', length: 'Mato ilgis (H#)', solutions: 'Skirtingų pilnų sprendimo linijų skaičius', candidates: 'Kiek pozicijų rasti', white: 'Baltų figūrų (tiksliai)', black: 'Juodų figūrų (mažiausiai)', whiteKinds: 'Baltųjų figūros', blackKinds: 'Juodųjų figūros', filters: 'Filtrai (pasirinktinai)', exactSolutions: 'Reikalauti tiksliai pasirinkto sprendimų skaičiaus', noDuals: 'Atmesti dualus', idealTwin: 'Abipusis laukelių ir matų motyvas', themeLevelOne: '1 lygis: baltųjų abipusis perėjimas ir matai', themeLevelTwo: '2 lygis: juodųjų ir baltųjų abipusiai perėjimai', start: 'Generuoti pozicijas', stop: 'Stabdyti', searching: 'Ieškoma tinkamų pozicijų…', checkingBlackPiece: 'Tikrinamas juodos figūros būtinumas', attempted: 'Patikrinta pozicijų', found: 'Rasta', solvedPositions: 'Popeye rado sprendinį pozicijose', matchingSolutionCount: 'Atitinka pasirinktą sprendimų skaičių', matchingNoDuals: 'Iš jų be dualų', matchingWhiteParticipation: 'Iš jų dalyvauja visos baltos ne pėstininkės figūros', matchingIdealTheme: 'Iš jų atitinka abipusį motyvą', matchingBlackEssential: 'Iš jų kiekviena juoda figūra būtina', limit: 'Paieška baigėsi. Pakeiskite nustatymus ir bandykite dar kartą.', review: 'Įvertinkite poziciją', accept: 'Patinka – išsaugoti', reject: 'Atmesti', accepted: 'Patvirtinta', rejected: 'Atmesta', key: 'Key sprendiniai', set: 'Set play', copyFen: 'Kopijuoti FEN', copied: 'Nukopijuota', noResults: 'Tinkamų pozicijų dar nerasta.', criteria: '1 lygis: skirtingos baltos figūros pereina per tą patį laukelį ir matuoja į tą patį laukelį, o juodųjų pagalba vyksta skirtingais vienetais. 2 lygis: papildomai skirtingos juodos figūros pasiekia tą patį laukelį. Kiekviena balta ne pėstininkė figūra turi dalyvauti mate, o pašalinus bet kurią juodą ne karalių figūrą turi pasikeisti visas sprendinių rinkinys.', max: 'Vienoje paieškoje tikrinama iki 100 000 atsitiktinių pozicijų; galima rinktis iki 1 000 rezultatų.', error: 'Generatoriaus klaida', noWhitePieces: 'Pasirinkite bent vieną papildomą figūrą baltiesiems.', noBlackPieces: 'Pasirinkite bent vieną papildomą figūrą juodiesiems.', counts: 'Baltųjų turi būti bent 2, juodųjų gali būti 1 (skaičiuojant karalius).'
  },
  en: {
    title: 'H problem generator', intro: 'Generate and review new helpmate positions.', settings: 'Search settings', length: 'Mate length (H#)', solutions: 'Distinct full solution lines', candidates: 'Positions to find', white: 'White pieces (exact)', black: 'Black pieces (minimum)', whiteKinds: 'White piece types', blackKinds: 'Black piece types', filters: 'Optional filters', exactSolutions: 'Require exactly the selected solution count', noDuals: 'Exclude duals', idealTwin: 'Reciprocal arrival-square and mate theme', themeLevelOne: 'Level 1: White reciprocal arrival and mates', themeLevelTwo: 'Level 2: White and Black reciprocal arrivals', start: 'Generate positions', stop: 'Stop', searching: 'Searching for matching positions…', checkingBlackPiece: 'Checking whether a Black piece is essential', attempted: 'Positions checked', found: 'Found', solvedPositions: 'Popeye found solutions in', matchingSolutionCount: 'Match the selected solution count', matchingNoDuals: 'Of those, without duals', matchingWhiteParticipation: 'Of those, every White non-pawn piece participates', matchingIdealTheme: 'Of those, matching the reciprocal theme', matchingBlackEssential: 'Of those, every Black piece is essential', limit: 'Search finished. Adjust the settings and try again.', review: 'Review this position', accept: 'Keep this position', reject: 'Reject', accepted: 'Kept', rejected: 'Rejected', key: 'Key solutions', set: 'Set play', copyFen: 'Copy FEN', copied: 'Copied', noResults: 'No matching positions found yet.', criteria: 'Level 1: different White pieces reach the same square and mate on the same square, with different Black helpers. Level 2: different Black pieces also reach the same square. Each White non-pawn piece must participate. Removing any Black non-king piece must change the complete solution set. Exact solution count and dual rejection remain optional filters.', max: 'Each search checks up to 100,000 random positions; choose up to 1,000 results.', error: 'Generator error', noWhitePieces: 'Choose at least one additional piece type for White.', noBlackPieces: 'Choose at least one additional piece type for Black.', counts: 'White needs at least 2 pieces and Black at least 1, including kings.'
  }
};

function fenBoard(fen) {
  const chess = new Chess(fen);
  return chess.board().map((row) => row.map((piece) => piece ? piece.color + piece.type.toUpperCase() : null));
}

export default function HelpMateGenerator({ language = 'en' }) {
  const t = copy[language] || copy.en;
  const [config, setConfig] = useState(initialConfig);
  const [candidates, setCandidates] = useState([]);
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState({ attempts: 0, found: 0, solvedPositions: 0, matchingSolutionCount: 0, matchingNoDuals: 0, matchingWhiteParticipation: 0, matchingIdealTheme: 0, matchingBlackEssential: 0, maxAttempts });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const workerRef = useRef(null);
  const runIdRef = useRef(0);
  const current = useMemo(() => candidates.find((candidate) => !candidate.review), [candidates]);
  const accepted = candidates.filter((candidate) => candidate.review === 'accepted');
  const reviewNumber = candidates.filter((candidate) => !candidate.review).length;

  useEffect(() => () => workerRef.current?.terminate(), []);

  function changeConfig(name, value) {
    setConfig((old) => ({ ...old, [name]: value }));
  }

  function togglePiece(color, piece) {
    const key = color === 'w' ? 'whitePieces' : 'blackPieces';
    setConfig((old) => ({ ...old, [key]: old[key].includes(piece) ? old[key].filter((item) => item !== piece) : [...old[key], piece] }));
  }

  function toggleFilter(filter) {
    setConfig((old) => ({ ...old, filters: old.filters.includes(filter) ? old.filters.filter((item) => item !== filter) : [...old.filters, filter] }));
  }

  async function start() {
    if (!config.whitePieces.length) { setError(t.noWhitePieces); return; }
    if (config.blackCount > 1 && !config.blackPieces.length) { setError(t.noBlackPieces); return; }
    if (config.whiteCount < 2 || config.whiteCount > 16 || config.blackCount < 1 || config.blackCount > 16 || config.whiteCount + config.blackCount > 32) { setError(t.counts); return; }
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./helpMateGeneratorWorker.js', import.meta.url), { type: 'module' });
    const runId = Date.now() + Math.random();
    runIdRef.current = runId;
    workerRef.current = worker;
    setCandidates([]);
    setProgress({ attempts: 0, found: 0, solvedPositions: 0, matchingSolutionCount: 0, matchingNoDuals: 0, matchingWhiteParticipation: 0, matchingIdealTheme: 0, matchingBlackEssential: 0, maxAttempts });
    setError('');
    setState('running');
    worker.onmessage = ({ data }) => {
      if (data.runId !== runIdRef.current) return;
      if (data.type === 'candidate') setCandidates((old) => [...old, { ...data.candidate, review: null }]);
      if (data.type === 'checked') saveSeenPositions(data.positions);
      if (data.type === 'progress') setProgress(data);
      if (data.type === 'complete') { setProgress(data); setState('complete'); worker.terminate(); if (workerRef.current === worker) workerRef.current = null; }
      if (data.type === 'error') { setError(data.message); setState('error'); worker.terminate(); if (workerRef.current === worker) workerRef.current = null; }
    };
    worker.onerror = (event) => { setError(event.message || t.error); setState('error'); worker.terminate(); workerRef.current = null; };
    const seenPositions = await loadSeenPositions();
    if (workerRef.current !== worker) return;
    worker.postMessage({ type: 'generate', runId, config, seenPositions, maxAttempts, wasmUrl: import.meta.env.BASE_URL + 'popeye/py.wasm' });
  }

  function stop() {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel', runId: runIdRef.current });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setState('complete');
  }

  function reviewCurrent(review) {
    if (!current) return;
    setCandidates((old) => old.map((candidate) => candidate.number === current.number ? { ...candidate, review } : candidate));
  }

  async function copyFen() {
    if (!current) return;
    await navigator.clipboard?.writeText(current.fen);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const board = current ? fenBoard(current.fen) : null;
  return <main className="help-generator">
    <header className="help-generator__header"><div><h1>{t.title}</h1><p>{t.intro}</p></div><span className="help-generator__summary">{accepted.length} {t.accepted.toLowerCase()}</span></header>
    <div className="help-generator__layout">
      <section className="help-generator__card help-generator__settings">
        <h2>{t.settings}</h2>
        <div className="help-generator__fields">
          <label>{t.length}<select value={config.moves} disabled={state === 'running'} onChange={(event) => changeConfig('moves', Number(event.target.value))}>{Array.from({ length: 9 }, (_, i) => i + 2).map((length) => <option key={length} value={length}>{length}</option>)}</select></label>
          <label>{t.solutions}<select value={config.solutionCount} disabled={state === 'running'} onChange={(event) => changeConfig('solutionCount', Number(event.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>{t.candidates}<select value={config.candidateCount} disabled={state === 'running'} onChange={(event) => changeConfig('candidateCount', Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 8, 10, 20, 50, 100, 250, 500, 1000].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>{t.white}<input type="number" min="2" max="16" value={config.whiteCount} disabled={state === 'running'} onChange={(event) => changeConfig('whiteCount', Number(event.target.value))} /></label>
          <label>{t.black}<input type="number" min="1" max="16" value={config.blackCount} disabled={state === 'running'} onChange={(event) => changeConfig('blackCount', Number(event.target.value))} /></label>
        </div>
        {[["w", t.whiteKinds, config.whitePieces], ["b", t.blackKinds, config.blackPieces]].map(([color, legend, selected]) => <fieldset className="help-generator__pieces" key={color}><legend>{legend}</legend>{Object.entries(pieceNames).map(([piece, name]) => <label key={piece}><input type="checkbox" checked={selected.includes(piece)} disabled={state === 'running'} onChange={() => togglePiece(color, piece)} />{language === 'lt' ? ({ Queen: 'Valdovė', Rook: 'Bokštas', Bishop: 'Rikis', Knight: 'Žirgas', Pawn: 'Pėstininkas' })[name] : name}</label>)}</fieldset>)}
        <fieldset className="help-generator__pieces help-generator__filters"><legend>{t.filters}</legend>{[['exact-solutions', t.exactSolutions], ['no-duals', t.noDuals], ['ideal-twin', t.idealTwin]].map(([filter, label]) => <label key={filter}><input type="checkbox" checked={config.filters.includes(filter)} disabled={state === 'running'} onChange={() => toggleFilter(filter)} />{label}</label>)}</fieldset>
        <p className="help-generator__criteria">{t.criteria}</p><p className="help-generator__limit">{t.max}</p>
        {error && <p className="help-generator__error" role="alert">{error}</p>}
        <button type="button" className="help-generator__start" onClick={state === 'running' ? stop : start}>{state === 'running' ? t.stop : t.start}</button>
        {state === 'running' && <div className="help-generator__progress" aria-live="polite"><div><span>{progress.stage === 'black-essential' ? `${t.checkingBlackPiece} ${progress.piece}/${progress.pieceCount}` : t.searching}</span><strong>{t.found}: {progress.found}</strong></div><progress max={progress.maxAttempts} value={progress.attempts} /><small>{t.attempted}: {progress.attempts} / {progress.maxAttempts}</small><small>{t.solvedPositions}: {progress.solvedPositions}; {t.matchingSolutionCount}: {progress.matchingSolutionCount}; {t.matchingNoDuals}: {progress.matchingNoDuals}</small><small>{t.matchingWhiteParticipation}: {progress.matchingWhiteParticipation}; {t.matchingIdealTheme}: {progress.matchingIdealTheme}; {t.matchingBlackEssential}: {progress.matchingBlackEssential}</small></div>}
      </section>

      <section className="help-generator__card help-generator__review">
        <h2>{current ? t.review : state === 'running' ? t.searching : t.noResults}</h2>
        {!current && candidates.length > 0 && <p>{t.noResults}</p>}
        {!current && state === 'complete' && candidates.length === 0 && <p>{t.limit}</p>}
        {current && board && <>
          <div className="help-generator__position"><div className="help-generator__board" aria-label="Generated helpmate position">{board.flatMap((row, rowIndex) => row.map((piece, fileIndex) => <div className={(rowIndex + fileIndex) % 2 ? 'is-dark' : 'is-light'} key={rowIndex + '-' + fileIndex}>{piece && <img src={pieceImages[piece]} alt={piece} />}</div>))}</div>
            <div className="help-generator__answer">{current.themeLevel > 0 && <p>{current.themeLevel === 2 ? t.themeLevelTwo : t.themeLevelOne}</p>}<h3>{t.key} ({current.roots})</h3><pre>{current.groups.play.join('\n') || '—'}</pre><h3>{t.set}</h3><pre>{current.groups.setPlay.join('\n') || '—'}</pre><button type="button" className="help-generator__copy" onClick={copyFen}>{copied ? t.copied : t.copyFen}</button></div>
          </div>
          <div className="help-generator__actions"><button type="button" className="is-keep" onClick={() => reviewCurrent('accepted')}>{t.accept}</button><button type="button" className="is-reject" onClick={() => reviewCurrent('rejected')}>{t.reject}</button><span>{reviewNumber} {language === 'lt' ? 'liko įvertinti' : 'left to review'}</span></div>
        </>}
        {accepted.length > 0 && <div className="help-generator__kept"><h3>{language === 'lt' ? 'Patvirtintos pozicijos' : 'Kept positions'}</h3>{accepted.map((candidate) => <button type="button" key={candidate.number} onClick={() => setCandidates((old) => old.map((item) => item.number === candidate.number ? { ...item, review: null } : item))}>H#{config.moves} · {candidate.roots} {language === 'lt' ? 'sprend.' : 'solutions'} · {candidate.fen.split(' ')[0]}</button>)}</div>}
      </section>
    </div>
  </main>;
}
