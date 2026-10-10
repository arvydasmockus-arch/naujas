import { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { solvingTranslations } from './solvingTranslations';
import './ChessBoard.css';

const pieceImages = Object.fromEntries(Object.entries(import.meta.glob('./assets/chess/*.svg', { eager: true, query: '?url', import: 'default' }))
  .map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]));
let moveSound;
let audioContext;

function unlockMoveSound() {
  try {
    if (typeof Audio !== 'undefined') {
      moveSound ??= new Audio('https://lichess1.org/assets/sound/standard/Move.mp3');
      moveSound.preload = 'auto';
      moveSound.load();
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) {
      audioContext ??= new Context();
      if (audioContext.state === 'suspended') void audioContext.resume();
    }
  } catch { /* Some browsers disable audio; moves must still work. */ }
}

function playFallbackMoveSound() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext ??= new Context();
    const context = audioContext;
    if (context.state === 'suspended') void context.resume();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(420, start);
    oscillator.frequency.exponentialRampToValueAtTime(260, start + 0.07);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.06, start + 0.006);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.105);
    oscillator.onended = () => { void context.close(); };
  } catch { /* Sound is optional; it must never block a move. */ }
}

function playMoveSound() {
  try {
    if (typeof Audio === 'undefined') { playFallbackMoveSound(); return; }
    moveSound ??= new Audio('https://lichess1.org/assets/sound/standard/Move.mp3');
    moveSound.currentTime = 0;
    void moveSound.play().catch(playFallbackMoveSound);
  } catch { playFallbackMoveSound(); }
}

function ChessBoard({ fen, disabled, onMove, language = 'en', compact = false, description }) {
  const t = solvingTranslations[language];
  const names = t.pieceNames;
  const [preview, setPreview] = useState(() => ({ source: fen, position: fen }));
  const position = preview.source === fen ? preview.position : fen;
  const chess = useMemo(() => new Chess(position), [position]);
  const [selected, setSelected] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [message, setMessage] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const drag = useRef(null);
  const boardRef = useRef(null);
  const destinations = selected ? chess.moves({ square: selected, verbose: true }).map((move) => move.to) : [];

  function submitMove(from, to, promote) {
    if (disabled) return;
    const moves = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!moves.length) { setMessage(t.invalidMove); return; }
    if (moves.some((move) => move.promotion) && !promote) {
      setPromotion({ from, to });
      return;
    }
    const move = moves.find((item) => (item.promotion ?? '') === (promote ?? ''));
    if (move) {
      const movedPosition = new Chess(chess.fen());
      movedPosition.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      setPreview({ source: fen, position: movedPosition.fen() });
      setSelected(null);
      setPromotion(null);
      setMessage('');
      playMoveSound();
      onMove(move.lan);
    }
  }

  function chooseSquare(square) {
    if (disabled || promotion) return;
    const piece = chess.get(square);
    if (piece?.color === 'w') {
      setSelected(square === selected ? null : square);
      setMessage('');
    } else if (selected) submitMove(selected, square);
  }

  function pointerDown(event, square) {
    if (disabled || promotion || event.button !== 0) return;
    event.preventDefault();
    unlockMoveSound();
    if (chess.get(square)?.color === 'w') {
      drag.current = { from: square, x: event.clientX, y: event.clientY };
      setSelected(square);
      setMessage('');
      if (event.pointerType !== 'touch') {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
      }
    } else chooseSquare(square);
  }

  function pointerUp(event) {
    const current = drag.current;
    drag.current = null;
    setDragPreview(null);
    if (!current || disabled) return;
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8;
    const board = boardRef.current;
    if (moved && board) {
      const bounds = board.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x >= 0 && y >= 0 && x < bounds.width && y < bounds.height) {
        const file = Math.floor((x / bounds.width) * 8);
        const rank = 8 - Math.floor((y / bounds.height) * 8);
        submitMove(current.from, `${String.fromCharCode(97 + file)}${rank}`);
      }
    }
  }

  return (
    <div className={`chess-board-wrap${compact ? ' chess-board-wrap--compact' : ''}`}>
      <div ref={boardRef} className="chess-board" role="group" aria-label={description ?? t.boardLabel}>
        {chess.board().flat().map((piece, index) => {
          const rank = 8 - Math.floor(index / 8);
          const file = String.fromCharCode(97 + index % 8);
          const square = `${file}${rank}`;
          const label = piece ? `${square}, ${piece.color === 'w' ? t.white : t.black} ${names[piece.type]}` : `${square}, ${t.empty}`;
          return (
            <button key={square} type="button" data-square={square}
              className={`chess-board__square ${(Math.floor(index / 8) + index % 8) % 2 ? 'chess-board__square--dark' : 'chess-board__square--light'}${selected === square ? ' chess-board__square--selected' : ''}`}
              aria-label={label} aria-pressed={selected === square} disabled={disabled || Boolean(promotion)}
              onPointerDown={(event) => pointerDown(event, square)} onPointerUp={pointerUp}
              onPointerMove={(event) => {
                const current = drag.current;
                if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) {
                  const movingPiece = chess.get(current.from);
                  setDragPreview({ url: pieceImages[`${movingPiece.color}${movingPiece.type.toUpperCase()}`], x: event.clientX, y: event.clientY });
                }
              }}
              onPointerCancel={() => { drag.current = null; setDragPreview(null); }}
              onClick={(event) => { if (event.detail === 0) chooseSquare(square); }}>
              {index % 8 === 0 && <span className="chess-board__rank" aria-hidden="true">{rank}</span>}
              {piece && <img className={`chess-board__piece${dragPreview && selected === square ? ' chess-board__piece--dragging' : ''}`}
                src={pieceImages[`${piece.color}${piece.type.toUpperCase()}`]} alt="" draggable="false" />}
              {destinations.includes(square) && <span className="chess-board__dot" aria-hidden="true" />}
              {rank === 1 && <span className="chess-board__file" aria-hidden="true">{file}</span>}
            </button>
          );
        })}
      </div>
      {dragPreview && <img className="chess-board__drag-preview" src={dragPreview.url} alt="" style={{ left: dragPreview.x, top: dragPreview.y }} />}
      {promotion && <div className="chess-board__promotion" role="group" aria-label={t.promote}>
        <p>{t.promote}</p>
        {['q', 'r', 'b', 'n'].map((type) => <button key={type} type="button" disabled={disabled}
          onClick={() => submitMove(promotion.from, promotion.to, type)}>{names[type]}</button>)}
        <button type="button" onClick={() => setPromotion(null)}>{t.cancel}</button>
      </div>}
      {!compact && <p className="chess-board__message" role="status">{message || t.boardHint}</p>}
    </div>
  );
}

export default ChessBoard;
