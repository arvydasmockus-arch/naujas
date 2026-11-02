import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import './PositionLab.css';

const pieceImages = Object.fromEntries(Object.entries(import.meta.glob('./assets/chess/*.svg', { eager: true, query: '?url', import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]));
const files = 'abcdefgh';
const initialPieces = () => {
  const chess = new Chess();
  return Object.fromEntries(chess.board().flatMap((row, rank) => row.map((piece, file) =>
    piece ? [files[file] + (8 - rank), piece.color + piece.type.toUpperCase()] : null).filter(Boolean)));
};
const copy = {
  lt: { title: 'Pozicijų analizė', subtitle: 'Sudėliokite figūras ir iškart analizuokite su Stockfish.', pieces: 'Figūros', white: 'Baltųjų ėjimas', black: 'Juodųjų ėjimas', ready: 'Variklis paruoštas', loading: 'Įkeliamas Stockfish…', engineOn: 'Variklis įjungtas', engineOff: 'Variklis išjungtas', enableEngine: 'Įjungti variklį', disableEngine: 'Išjungti variklį', showPosition: 'Rodyti poziciją po šio ėjimo', best: 'Geriausias ėjimas', evaluation: 'Įvertinimas', mate: 'Matas', noMate: 'Matas šiuo gyliu nerastas', checkmate: 'Šioje pozicijoje matas', stalemate: 'Patas', invalid: 'Pozicija negalioja', erase: 'Trinti', start: 'Pradinė padėtis', clear: 'Išvalyti lentą', flip: 'Apversti lentą', copy: 'Kopijuoti', copied: 'Nukopijuota', loadFen: 'Įkelti', fenPlaceholder: 'Įklijuokite FEN poziciją', invalidFen: 'Neteisingas FEN. Patikrinkite pozicijos įrašą.', thinking: 'Matas nerastas iki šio gylio nereiškia, kad jo nėra.' },
  en: { title: 'Position analysis', subtitle: 'Place pieces and analyze instantly with Stockfish.', pieces: 'Pieces', white: 'White to move', black: 'Black to move', ready: 'Engine ready', loading: 'Loading Stockfish…', engineOn: 'Engine on', engineOff: 'Engine off', enableEngine: 'Turn engine on', disableEngine: 'Turn engine off', showPosition: 'Show position after this move', best: 'Best move', evaluation: 'Evaluation', mate: 'Mate', noMate: 'No mate found at this depth', checkmate: 'This position is checkmate', stalemate: 'Stalemate', invalid: 'Invalid position', erase: 'Erase', start: 'Starting position', clear: 'Clear board', flip: 'Flip board', copy: 'Copy', copied: 'Copied', loadFen: 'Load', fenPlaceholder: 'Paste a FEN position', invalidFen: 'Invalid FEN. Check the position notation.', thinking: 'Not finding mate at this depth does not prove there is no mate.' },
  ru: { title: 'Анализ позиции', subtitle: 'Расставьте фигуры и сразу анализируйте с Stockfish.', pieces: 'Фигуры', white: 'Ход белых', black: 'Ход чёрных', ready: 'Движок готов', loading: 'Загрузка Stockfish…', engineOn: 'Движок включён', engineOff: 'Движок выключен', enableEngine: 'Включить движок', disableEngine: 'Выключить движок', showPosition: 'Показать позицию после этого хода', best: 'Лучший ход', evaluation: 'Оценка', mate: 'Мат', noMate: 'Мат на этой глубине не найден', checkmate: 'В этой позиции мат', stalemate: 'Пат', invalid: 'Недопустимая позиция', erase: 'Стереть', start: 'Начальная позиция', clear: 'Очистить доску', flip: 'Перевернуть доску', copy: 'Копировать', copied: 'Скопировано', loadFen: 'Загрузить', fenPlaceholder: 'Вставьте позицию FEN', invalidFen: 'Неверный FEN. Проверьте запись позиции.', thinking: 'Если мат не найден на этой глубине, это не значит, что его точно нет.' },
};

function toFen(pieces, turn, metadata = null) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = ''; let empty = 0;
    for (const file of files) {
      const piece = pieces[file + rank];
      if (!piece) empty += 1;
      else { if (empty) row += empty; empty = 0; row += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase(); }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let castling = '';
  if (pieces.e1 === 'wK' && pieces.h1 === 'wR') castling += 'K';
  if (pieces.e1 === 'wK' && pieces.a1 === 'wR') castling += 'Q';
  if (pieces.e8 === 'bK' && pieces.h8 === 'bR') castling += 'k';
  if (pieces.e8 === 'bK' && pieces.a8 === 'bR') castling += 'q';
  return rows.join('/') + ' ' + turn + ' ' + (metadata?.castling ?? (castling || '-')) + ' '
    + (metadata?.enPassant ?? '-') + ' ' + (metadata?.halfmove ?? '0') + ' ' + (metadata?.fullmove ?? '1');
}

export default function PositionLab({ language = 'en' }) {
  const t = copy[language] || copy.en;
  const restartLabel = language === 'lt' ? 'Paleisti variklį iš naujo' : language === 'ru' ? 'Перезапустить движок' : 'Restart engine';
  const engineTimeoutLabel = language === 'lt' ? 'Variklis neatsako. Paleiskite jį iš naujo.' : language === 'ru' ? 'Движок не отвечает. Перезапустите его.' : 'Engine is not responding. Restart it.';
  const engineTimeoutLabelRef = useRef(engineTimeoutLabel);
  const [pieces, setPieces] = useState(initialPieces);
  const [turn, setTurn] = useState('w');
  const [selected, setSelected] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  const [engineName, setEngineName] = useState('Stockfish');
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [engineError, setEngineError] = useState('');
  const [engineRestart, setEngineRestart] = useState(0);
  const [lineCount, setLineCount] = useState(5);
  const [analysis, setAnalysis] = useState({ state: 'loading', lines: {}, depth: 0 });
  const [copied, setCopied] = useState(false);
  const [fenDraft, setFenDraft] = useState(null);
  const [fenError, setFenError] = useState('');
  const [fenMetadata, setFenMetadata] = useState(null);
  const [problemSolution, setProblemSolution] = useState({ state: 'idle', groups: null });
  const [activeAnswerPhases, setActiveAnswerPhases] = useState(['play']);
  const popeyeWorker = useRef(null);
  const worker = useRef(null);
  const engineEnabledRef = useRef(true);
  const fen = useMemo(() => toFen(pieces, turn, fenMetadata), [pieces, turn, fenMetadata]);
  const game = useMemo(() => { try { return new Chess(fen); } catch { return null; } }, [fen]);

  useEffect(() => {
    popeyeWorker.current?.terminate();
    popeyeWorker.current = null;
  }, [fen]);
  useEffect(() => () => popeyeWorker.current?.terminate(), []);

  function solveProblem() {
    popeyeWorker.current?.terminate();
    setProblemSolution({ state: 'loading', groups: null, fen });
    setActiveAnswerPhases(['play']);
    const solver = new Worker(new URL('./mateSolverWorker.js', import.meta.url), { type: 'module' });
    popeyeWorker.current = solver;
    solver.onmessage = ({ data }) => {
      if (data.type === 'solution') {
        setProblemSolution({ state: 'done', groups: data.groups, fen });
        solver.terminate();
        if (popeyeWorker.current === solver) popeyeWorker.current = null;
      }
      if (data.type === 'error') {
        setProblemSolution({ state: 'error', groups: null, error: data.message, fen });
        solver.terminate();
        if (popeyeWorker.current === solver) popeyeWorker.current = null;
      }
    };
    solver.onerror = (event) => {
      setProblemSolution({ state: 'error', groups: null, error: event.message || 'Problem solver failed.', fen });
      solver.terminate();
      if (popeyeWorker.current === solver) popeyeWorker.current = null;
    };
    solver.postMessage({ type: 'solve', fen });
  }

  useEffect(() => { engineTimeoutLabelRef.current = engineTimeoutLabel; }, [engineTimeoutLabel]);

  useEffect(() => {
    let active = true;
    const engine = new Worker(import.meta.env.BASE_URL + 'stockfish/stockfish.js');
    worker.current = engine;
    const startupTimeout = window.setTimeout(() => {
      if (!active) return;
      setEngineError(engineTimeoutLabelRef.current);
      setAnalysis({ state: 'error', lines: {}, depth: 0 });
    }, 20000);
    engine.onmessage = ({ data }) => {
      if (!active || typeof data !== 'string') return;
      const line = data;
      if (line === 'uciok') { window.clearTimeout(startupTimeout); setReady(true); }
      if (line.startsWith('id name ')) setEngineName(line.slice(8));
      if (line.startsWith('info ')) {
        if (!engineEnabledRef.current) return;
        const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
        const score = line.match(/\bscore (cp|mate) (-?\d+)/);
        const pv = line.match(/\bpv (.+)$/)?.[1] || '';
        const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
        if (score && pv) setAnalysis((old) => ({ ...old, state: 'analyzing', depth: Math.max(old.depth, depth),
          lines: { ...old.lines, [multipv]: { score: score[1] === 'cp' ? Number(score[2]) / 100 : null, mate: score[1] === 'mate' ? Number(score[2]) : null, pv } } }));
      }
      if (line.startsWith('bestmove ') && engineEnabledRef.current) setAnalysis((old) => ({ ...old, state: 'done', best: line.split(/\s+/)[1] }));
    };
    engine.onerror = (event) => {
      if (!active) return;
      window.clearTimeout(startupTimeout);
      setEngineError(event.message || 'Stockfish worker failed to load.');
      setAnalysis((old) => ({ ...old, state: 'error' }));
    };
    engine.postMessage('uci');
    return () => {
      active = false;
      window.clearTimeout(startupTimeout);
      if (worker.current === engine) worker.current = null;
      engine.terminate();
    };
  }, [engineRestart]);

  useEffect(() => {
    const allowPieceDrop = (event) => {
      if ([...event.dataTransfer.types].includes('application/x-position-lab-square')) event.preventDefault();
    };
    const removeDroppedPiece = (event) => {
      if (event.target.closest?.('.position-lab__square')) return;
      const square = event.dataTransfer.getData('application/x-position-lab-square');
      if (!square) return;
      event.preventDefault();
      setFenMetadata(null);
      setFenDraft(null);
      setFenError('');
      setPieces((old) => { const next = { ...old }; delete next[square]; return next; });
      setSelected(null);
    };
    window.addEventListener('dragover', allowPieceDrop);
    window.addEventListener('drop', removeDroppedPiece);
    return () => {
      window.removeEventListener('dragover', allowPieceDrop);
      window.removeEventListener('drop', removeDroppedPiece);
    };
  }, []);

  useEffect(() => {
    const engine = worker.current;
    if (!ready || !engine) return undefined;
    engine.postMessage('stop');
    if (!engineEnabled) return undefined;
    if (!game || game.isCheckmate() || game.isStalemate()) return undefined;
    const timer = setTimeout(() => {
      setAnalysis({ state: 'analyzing', lines: {}, depth: 0 });
      engine.postMessage('setoption name MultiPV value ' + lineCount);
      engine.postMessage('position fen ' + fen);
      engine.postMessage('go infinite');
    }, 250);
    return () => clearTimeout(timer);
  }, [engineEnabled, fen, lineCount, ready, game]);

  function squareClick(square) {
    if (selected?.type === 'erase') {
      if (pieces[square]) {
        setPieces((old) => { const next = { ...old }; delete next[square]; return next; });
        setFenMetadata(null);
        setFenDraft(null);
        setFenError('');
      }
      return;
    }
    if (selected?.type === 'piece') {
      setPieces((old) => ({ ...old, [square]: selected.code }));
      setFenMetadata(null);
      setFenDraft(null);
      setFenError('');
      return;
    }
    if (!selected) { if (pieces[square]) setSelected({ type: 'board', square }); return; }
    if (selected.square !== square) setPieces((old) => { const next = { ...old, [square]: old[selected.square] }; delete next[selected.square]; return next; });
    else { setSelected(null); return; }
    setFenMetadata(null);
    setFenDraft(null);
    setFenError('');
    setSelected(null);
  }

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const boardFiles = flipped ? [...files].reverse() : [...files];
  const sanMoves = (uciLine) => {
    if (!uciLine || !game) return [];
    const current = new Chess(fen);
    let moveNumber = Number(fen.split(' ')[5]) || 1;
    let color = current.turn();
    return uciLine.split(' ').map((uci, index) => {
      let san;
      try { san = current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) })?.san || uci; }
      catch { san = uci; }
      const prefix = color === 'w' ? moveNumber + '.' : index === 0 ? moveNumber + '...' : '';
      if (color === 'b') moveNumber += 1;
      color = color === 'w' ? 'b' : 'w';
      return { uci, prefix, san };
    });
  };
  function showVariationPosition(uciLine, selectedIndex) {
    try {
      const position = new Chess(fen);
      const moves = uciLine.split(' ').slice(0, selectedIndex + 1);
      for (const uci of moves) {
        position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
      }
      const nextPieces = Object.fromEntries(position.board().flatMap((row, rank) => row.map((piece, file) =>
        piece ? [files[file] + (8 - rank), piece.color + piece.type.toUpperCase()] : null).filter(Boolean)));
      const [, , castling, enPassant, halfmove, fullmove] = position.fen().split(' ');
      setPieces(nextPieces);
      setTurn(position.turn());
      setFenMetadata({ castling, enPassant, halfmove, fullmove });
      setFenDraft(null);
      setFenError('');
      setSelected(null);
      setAnalysis({ state: 'analyzing', lines: {}, depth: 0 });
    } catch { /* Ignore a stale or illegal variation move. */ }
  }
  const lines = engineEnabled ? Object.entries(analysis.lines || {}).map(([number, line]) => ({ number: Number(number), ...line })).filter((line) => line.number <= lineCount).sort((a, b) => a.number - b.number) : [];
  const scoreLabel = (line) => line.mate !== null ? '#' + line.mate : (line.score > 0 ? '+' : '') + line.score.toFixed(2);
  const displayedState = !engineEnabled ? 'disabled' : !game ? 'invalid' : game.isCheckmate() ? 'checkmate' : game.isStalemate() ? 'stalemate' : analysis.state;
  const popeyeAnswers = problemSolution.fen === fen ? problemSolution.groups : null;
  function toggleAnswerPhase(phase) {
    setActiveAnswerPhases((active) => active.includes(phase)
      ? active.length === 1 ? active : active.filter((item) => item !== phase)
      : [...active, phase]);
  }
  async function copyPosition() {
    await navigator.clipboard?.writeText(fen);
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  }
  function applyFen(value, showError = true) {
    try {
      const trimmedFen = value.trim();
      const fields = trimmedFen.split(/\s+/);
      const completeFen = fields.length === 1 ? `${trimmedFen} w - - 0 1` : trimmedFen;
      const imported = new Chess(completeFen);
      const importedPieces = Object.fromEntries(imported.board().flatMap((row, rank) => row.map((piece, file) =>
        piece ? [files[file] + (8 - rank), piece.color + piece.type.toUpperCase()] : null).filter(Boolean)));
      const [, , castling, enPassant, halfmove, fullmove] = imported.fen().split(' ');
      setPieces(importedPieces);
      setTurn(imported.turn());
      setFenMetadata({ castling, enPassant, halfmove, fullmove });
      setSelected(null);
      setFenDraft(null);
      setFenError('');
      return true;
    } catch {
      if (showError) setFenError(t.invalidFen);
      return false;
    }
  }
  function loadFen() { applyFen(fenDraft ?? fen); }
  function pasteFen(event) {
    const value = event.clipboardData.getData('text').trim();
    if (!value) return;
    event.preventDefault();
    if (!applyFen(value, false)) {
      setFenDraft(value);
      setFenError(t.invalidFen);
    }
  }
  function toggleEngine() {
    const enabled = !engineEnabledRef.current;
    engineEnabledRef.current = enabled;
    setEngineEnabled(enabled);
    if (enabled) {
      setReady(false);
      setEngineError('');
      setAnalysis({ state: 'loading', lines: {}, depth: 0 });
      setEngineRestart((count) => count + 1);
    }
  }
  function restartEngine() {
    engineEnabledRef.current = true;
    setEngineEnabled(true);
    setReady(false);
    setEngineError('');
    setAnalysis({ state: 'loading', lines: {}, depth: 0 });
    setEngineRestart((count) => count + 1);
  }

  return <main className="position-lab">
    <header className="position-lab__header"><div><h1>{t.title}</h1><p>{t.subtitle}</p></div><span className={'position-lab__engine' + (ready && engineEnabled ? ' is-ready' : '')} title={engineError}><i />{!engineEnabled ? t.engineOff : ready ? t.ready : (engineError || t.loading)}</span></header>
    <div className="position-lab__layout">
      <div className="position-lab__board-panel"><section className="position-lab__board-wrap"><div className="position-lab__board">
        {ranks.map((rank, r) => boardFiles.map((file, c) => {
          const square = file + rank; const piece = pieces[square];
          return <button type="button" key={square} aria-label={square} className={'position-lab__square ' + ((r + c) % 2 ? 'is-dark' : 'is-light') + (selected?.square === square ? ' is-selected' : '')}
            onClick={() => squareClick(square)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
              event.preventDefault(); const data = event.dataTransfer.getData('text/plain'); setFenMetadata(null); setFenDraft(null); setFenError('');
              if (data.startsWith('piece:')) setPieces((old) => ({ ...old, [square]: data.slice(6) }));
              if (data.startsWith('square:')) setPieces((old) => { const next = { ...old, [square]: old[data.slice(7)] }; delete next[data.slice(7)]; return next; });
            }}>
            {c === 0 && <span className="position-lab__coordinate">{rank}</span>}{r === 7 && <span className="position-lab__coordinate position-lab__coordinate--file">{file}</span>}
            {piece && <img draggable onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', 'square:' + square);
              event.dataTransfer.setData('application/x-position-lab-square', square);
            }} src={pieceImages[piece]} alt={piece} />}
          </button>;
        }))}
      </div></section>
        <section className="position-lab__fen-panel" aria-label="FEN">
          <label htmlFor="position-lab-fen">FEN</label>
          <div className="position-lab__fen-controls">
            <input id="position-lab-fen" type="text" value={fenDraft ?? fen} placeholder={t.fenPlaceholder}
              aria-invalid={Boolean(fenError)} onChange={(event) => { setFenDraft(event.target.value); setFenError(''); }}
              onPaste={pasteFen} onKeyDown={(event) => { if (event.key === 'Enter') loadFen(); }} />
            <button type="button" title={t.copy} aria-label={t.copy} onClick={copyPosition}>{copied ? '✓' : '⧉'}</button>
          </div>
          {fenError && <p role="alert">{fenError}</p>}
        </section>
      </div>
      <aside className="position-lab__side">
        <section className="position-lab__card"><h2>{t.pieces}</h2>{['w', 'b'].map((color) => <div className="position-lab__piece-row" key={color}>{['K', 'Q', 'R', 'B', 'N', 'P'].map((kind) => {
          const code = color + kind;
          return <button type="button" draggable key={code} aria-label={code} className={selected?.code === code ? 'is-active' : ''} onClick={() => setSelected({ type: 'piece', code })}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', 'piece:' + code)}><img src={pieceImages[code]} alt={code} /></button>;
        })}</div>)}<button className={'position-lab__erase' + (selected?.type === 'erase' ? ' is-active' : '')} type="button" onClick={() => setSelected({ type: 'erase' })}>⌫ {t.erase}</button></section>
        <section className="position-lab__card position-lab__controls"><h2>{t.title}</h2><div className="position-lab__turn"><button className={turn === 'w' ? 'is-active' : ''} onClick={() => { setTurn('w'); setFenMetadata(null); setFenDraft(null); setFenError(''); }} type="button">{t.white}</button><button className={turn === 'b' ? 'is-active' : ''} onClick={() => { setTurn('b'); setFenMetadata(null); setFenDraft(null); setFenError(''); }} type="button">{t.black}</button></div>
          <div className="position-lab__buttons"><button type="button" onClick={() => { setPieces(initialPieces()); setTurn('w'); setFenMetadata(null); setFenDraft(null); setFenError(''); setSelected(null); }}>{t.start}</button><button type="button" onClick={() => { setPieces({}); setFenMetadata(null); setFenDraft(null); setFenError(''); setSelected(null); }}>{t.clear}</button><button type="button" onClick={() => setFlipped((value) => !value)}>{t.flip}</button></div></section>
        <section className="position-lab__card position-lab__result"><div className="position-lab__analysis-heading"><div className="position-lab__analysis-title"><h2>{language === 'lt' ? 'Geriausios linijos' : language === 'ru' ? 'Лучшие варианты' : 'Best lines'}</h2><button type="button" className={'position-lab__engine-toggle' + (engineEnabled ? ' is-active' : '')} aria-pressed={engineEnabled} onClick={toggleEngine}>{engineEnabled ? t.disableEngine : t.enableEngine}</button><button type="button" className="position-lab__engine-toggle" onClick={restartEngine}>{restartLabel}</button></div><div className="position-lab__analysis-options"><span className="position-lab__engine-version">{engineName}</span><label>{language === 'lt' ? 'Rodyti linijas' : language === 'ru' ? 'Показывать линий' : 'Show lines'}<select value={lineCount} onChange={(event) => setLineCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label></div></div>
          {displayedState === 'disabled' && <p>{t.engineOff}</p>}{displayedState === 'loading' && <p>{t.loading}</p>}{displayedState === 'invalid' && <p>{t.invalid}</p>}{displayedState === 'error' && <p>{engineError || 'Stockfish error'}</p>}{displayedState === 'checkmate' && <p>{t.checkmate}</p>}{displayedState === 'stalemate' && <p>{t.stalemate}</p>}
          <div className="position-lab__lines">{lines.map((line) => <div className="position-lab__line" key={line.number}><span className="position-lab__line-number">{line.number}.</span><strong>{scoreLabel(line)}</strong><span className="position-lab__line-moves">{sanMoves(line.pv).map((move, index) => <span key={index}>{move.prefix && <span className="position-lab__move-number">{move.prefix} </span>}<button type="button" className="position-lab__move-button" title={t.showPosition} onClick={() => showVariationPosition(line.pv, index)}>{move.san}</button>{' '}</span>)}</span></div>)}</div>
          {displayedState === 'analyzing' && lines.length === 0 && <p>{t.loading}</p>}{displayedState === 'done' && lines.length > 0 && lines.every((line) => line.mate === null) && <p className="position-lab__no-mate">{t.noMate}</p>}
          <p className="position-lab__depth">{language === 'lt' ? 'Gylis' : language === 'ru' ? 'Глубина' : 'Depth'}: {engineEnabled ? analysis.depth : 0}</p></section>
      </aside>
    </div>
    <section className="position-lab__card position-lab__problem-solver">
      <div className="position-lab__analysis-heading">
        <button type="button" className="position-lab__solve-button" onClick={solveProblem} disabled={problemSolution.state === 'loading' && problemSolution.fen === fen}>
          {problemSolution.state === 'loading' && problemSolution.fen === fen ? (language === 'lt' ? 'Sprendžiama…' : 'Solving…') : (language === 'lt' ? 'Rodyti atsakymus' : 'Show answers')}
        </button>
      </div>
      {problemSolution.fen === fen && problemSolution.state === 'loading' && <p>{language === 'lt' ? 'Sprendžiama…' : 'Solving…'}</p>}
      {problemSolution.fen === fen && problemSolution.state === 'error' && <p className="position-lab__answer-warning">{problemSolution.error}</p>}
      {popeyeAnswers && <>
        <div className="position-lab__answer-tabs" role="group" aria-label={language === 'lt' ? 'Rodyti atsakymus' : 'Show answers'}>
          {[["play", "Key"], ["tries", "Try"], ["setPlay", "Set"]].map(([phase, label]) => <button type="button" aria-pressed={activeAnswerPhases.includes(phase)} className={activeAnswerPhases.includes(phase) ? 'is-active' : ''} key={phase} onClick={() => toggleAnswerPhase(phase)}>
            <span className="position-lab__answer-check">{activeAnswerPhases.includes(phase) ? '✓' : ''}</span>{label}<span className="position-lab__answer-count">{popeyeAnswers[phase].length}</span>
          </button>)}
        </div>
        <div className="position-lab__answer-groups" aria-live="polite">
          {[["play", "Key"], ["tries", "Try"], ["setPlay", "Set"]].filter(([phase]) => activeAnswerPhases.includes(phase)).map(([phase, label]) => <section className={'position-lab__answer-group position-lab__answer-group--' + phase} key={phase}>
            <h3>{label}</h3>
            {popeyeAnswers[phase].length ? <pre>{popeyeAnswers[phase].map((line, index) => {
              const isRootMove = /^\s*1\.(?!\.)/.test(line);
              const className = phase === 'play' && isRootMove
                ? 'position-lab__answer-line--key'
                : phase === 'tries' && isRootMove && line.includes('?')
                  ? 'position-lab__answer-line--try'
                  : phase === 'tries' && /^\s*1\.\.\./.test(line) && line.includes('!')
                    ? 'position-lab__answer-line--refutation'
                    : '';
              return <span className={className} key={index}>{line || ' '}</span>;
            })}</pre> : <p>{language === 'lt' ? 'Šioje dalyje variantų nėra.' : 'No variations in this section.'}</p>}
          </section>)}
        </div>
      </>}
    </section>
  </main>;
}
