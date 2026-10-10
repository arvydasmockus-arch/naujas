import { useCallback, useEffect, useRef, useState } from 'react';
import ChessBoard from './ChessBoard';
import SolvingResults from './SolvingResults';
import ProblemReview from './ProblemReview';
import SolvingHallOfFame from './SolvingHallOfFame';
import { solvingTranslations } from './solvingTranslations';
import { getSolvingCatalog, getSolvingSeries, startSolvingProblem, submitSolvingAnswer } from './solvingApi';
import './SolvingPlatform.css';

const PREFERENCES = 'ml-solving-preferences-v2';
function preferences() {
  try { return JSON.parse(localStorage.getItem(PREFERENCES)) || {}; } catch { return {}; }
}
function dateLabel(date, language) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(language === 'lt' ? 'lt-LT' : 'en-GB',
    { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

function SolvingPlatform({ language = 'en' }) {
  const t = solvingTranslations[language];
  const [player, setPlayer] = useState('');
  const [draftName, setDraftName] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [activeDate, setActiveDate] = useState(() => preferences().date || null);
  const [series, setSeries] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [clockOffset, setClockOffset] = useState(0);
  const [showAllTimeStats, setShowAllTimeStats] = useState(false);
  const [visit] = useState(() => crypto.randomUUID());
  const startRequest = useRef(null);
  const submission = useRef(false);
  const selection = useRef(0);
  const count = series?.results.length ?? 0;
  const ordinal = count;
  const puzzle = feedback?.puzzle ?? series?.puzzles[ordinal];
  const elapsedMs = series?.startedAt === null || series?.startedAt === undefined ? 0
    : Math.max(0, now - clockOffset - series.startedAt);
  const available = series?.available;
  const days = catalog?.days ?? [];

  const showError = useCallback((problem) => {
    setError(problem.message === 'SOLVING_SERVER_UNAVAILABLE' || problem instanceof TypeError ? t.serverError : problem.message);
  }, [t.serverError]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PREFERENCES, JSON.stringify({ name: player, date: activeDate, language })); } catch { /* Server keeps results even when local storage is unavailable. */ }
  }, [player, activeDate, language]);

  useEffect(() => {
    const controller = new AbortController();
    function refresh() {
      getSolvingCatalog(player, controller.signal).then(setCatalog).catch((problem) => {
        if (!controller.signal.aborted) showError(problem);
      });
    }
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [player, showError]);

  useEffect(() => {
    if (!activeDate || !player) return;
    const controller = new AbortController();
    const request = ++selection.current;
    getSolvingSeries(activeDate, player, controller.signal).then((data) => {
      if (request !== selection.current) return;
      setSeries(data); setClockOffset(Date.now() - data.serverNow); setError('');
    }).catch((problem) => { if (!controller.signal.aborted) showError(problem); });
    return () => controller.abort();
  }, [activeDate, player, showError]);

  useEffect(() => {
    if (!series || !available || series.finished || feedback || busy || !player || series.date !== activeDate || series.player.toLowerCase() !== player.toLowerCase()) return;
    if (count === 0 && series.startedAt === null) return;
    const token = `${player}:${activeDate}:${count}:${visit}`;
    if (startRequest.current === token) return;
    let second;
    let cancelled = false;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (cancelled) return;
        startRequest.current = token;
        const request = selection.current;
        startSolvingProblem({ date: activeDate, name: player, ordinal: count, visit }).then((data) => {
          if (request !== selection.current) return;
          setSeries(data); setClockOffset(Date.now() - data.serverNow);
        }).catch((problem) => { startRequest.current = null; showError(problem); });
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(first); if (second) cancelAnimationFrame(second); };
  }, [series, available, activeDate, count, player, visit, feedback, busy, showError]);

  const refreshResults = useCallback(async () => {
    if (!activeDate || !player) return;
    const request = selection.current;
    try {
      const data = await getSolvingSeries(activeDate, player);
      if (request !== selection.current) return;
      setSeries((current) => current ? { ...current, leaderboard: data.leaderboard, statistics: data.statistics } : data);
    } catch (problem) { showError(problem); }
  }, [activeDate, player, showError]);

  useEffect(() => {
    const timer = setInterval(refreshResults, 10000);
    return () => clearInterval(timer);
  }, [refreshResults]);

  function chooseDate(date) {
    if (!player || busy || feedback || date === activeDate) return;
    ++selection.current;
    startRequest.current = null;
    setSeries(null); setError(''); setActiveDate(date);
  }

  function useName(event) {
    event.preventDefault();
    const name = draftName.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40) return;
    ++selection.current;
    startRequest.current = null;
    setSeries(null); setFeedback(null); setError('');
    setPlayer(name); setDraftName(name);
    if (name === player && activeDate) {
      const request = selection.current;
      getSolvingSeries(activeDate, name).then((data) => { if (request !== selection.current) return; setSeries(data); setClockOffset(Date.now() - data.serverNow); }).catch(showError);
    }
  }

  async function submit(move) {
    if (submission.current || !series || !available || feedback || series.startedAt === null) return;
    submission.current = true;
    setBusy(true); setError('');
    const submittedOrdinal = count;
    const currentPuzzle = puzzle;
    try {
      const data = await submitSolvingAnswer({ date: activeDate, name: player, ordinal: submittedOrdinal, move,
        elapsedMs: Math.max(0, Date.now() - clockOffset - series.startedAt) });
      const result = data.results[submittedOrdinal];
      setFeedback({ ...result, puzzle: currentPuzzle });
      setSeries(data); setClockOffset(Date.now() - data.serverNow);
      getSolvingCatalog(player).then(setCatalog).catch(() => {});
    } catch (problem) { showError(problem); }
    finally { submission.current = false; setBusy(false); }
  }

  async function startFirstProblem() {
    if (!series || !available || series.startedAt !== null || busy || count !== 0) return;
    const token = `${player}:${activeDate}:${count}:${visit}`;
    startRequest.current = token;
    setBusy(true); setError('');
    try {
      const data = await startSolvingProblem({ date: activeDate, name: player, ordinal: count, visit });
      if (data.date !== activeDate || data.player.toLowerCase() !== player.toLowerCase()) return;
      setSeries(data); setClockOffset(Date.now() - data.serverNow);
    } catch (problem) {
      startRequest.current = null;
      showError(problem);
    } finally { setBusy(false); }
  }

  function continueToNextProblem() {
    if (!feedback || series?.finished) return;
    startRequest.current = null;
    setFeedback(null);
  }

  function exportResults() {
    const file = new Blob([JSON.stringify(series, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a'); link.href = url; link.download = `ml-results-${activeDate}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const points = series?.results.filter((result) => result.correct).length ?? 0;
  const totalSeconds = series?.results.reduce((sum, result) => sum + result.seconds, 0) ?? 0;
  return (
    <main className="solving-page" lang={language}>
      <header className="solving-page__header">
        <div><span className="solving-page__eyebrow">{t.badge}</span><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      </header>
      <form className="solving-player-bar" onSubmit={useName}>
        <label htmlFor="solver-name">{t.player}</label>
        <input id="solver-name" value={draftName} maxLength={40} minLength={2} required disabled={busy || Boolean(feedback)}
          placeholder={t.player} onChange={(event) => setDraftName(event.target.value)} />
        <button type="submit" className="solving-button" disabled={busy || Boolean(feedback) || draftName.trim().length < 2}>{player ? t.changePlayer : t.useName}</button>
        <span>{t.nameHint}</span>
        {player && <strong className="solving-player-bar__active">{player}</strong>}
      </form>
      {error && <div className="solving-page__warning" role="alert">{error}<button type="button" onClick={() => window.location.reload()}>{t.refresh}</button></div>}
      <div className="solving-page__layout">
        <aside className="solving-panel solving-dates" aria-label={t.dates}>
          <h2>{t.dates}</h2><p>{t.dateHint} · UTC</p>
          <div className="solving-dates__list">
            {days.map((day) => <button key={day.date} type="button" className={[
              day.date === activeDate ? 'solving-dates__active' : '',
              day.answered === 6 ? 'solving-dates__completed' : day.answered > 0 ? 'solving-dates__partial' : '',
            ].filter(Boolean).join(' ')}
              aria-pressed={day.date === activeDate} disabled={!player || busy || Boolean(feedback)} onClick={() => chooseDate(day.date)}>
              <span>{day.date}{day.date === catalog.today ? ` · ${t.today}` : ''}</span>
              <small>{day.answered === 6 ? `${day.points}/6 ${t.points}` : day.answered ? `${t.started} · ${day.answered}/6` : t.problems} · {day.players} {t.players}</small>
            </button>)}
          </div>
          {catalog?.library && <div className="solving-library"><strong>{t.library}</strong>
            <p>{catalog.library.eligible.toLocaleString(language)} {t.playable}</p>
            <p>{catalog.library.imported.toLocaleString(language)} / {catalog.library.expected.toLocaleString(language)} {t.imported}</p>
            {catalog.library.importStatus.running && <small>{t.importRunning}</small>}
          </div>}
        </aside>
        <div className="solving-page__content">
          {!series && <section className="solving-panel solving-intro">
            <span className="solving-intro__symbol" aria-hidden="true">#2</span>
            <h2>{activeDate && player ? t.loading : t.ready}</h2><p>{player ? t.chooseDate : t.selectName}</p>
            <button type="button" className="solving-button" disabled={!player || !catalog || busy} onClick={() => chooseDate(catalog.today)}>{t.startToday}</button>
            <ul><li>{t.firstMove}</li><li>{t.oneAttempt}</li><li>{t.nextManual}</li><li>{t.timerRule}</li></ul>
          </section>}
          {series && <>
            <section className="solving-panel">
              <div className="solving-test__heading"><div><h2>{dateLabel(activeDate, language)}</h2>
                <p>{series.finished && !feedback ? t.finished : `${t.problem} ${feedback ? feedback.ordinal + 1 : Math.min(count + 1, 6)} ${t.of} 6 · #2`}</p></div>
                {puzzle && available && (series.startedAt !== null || feedback) && <div className="solving-timer"><strong>{feedback ? feedback.seconds : Math.floor(elapsedMs / 1000)}</strong><span>{t.seconds}</span></div>}
              </div>
              {!available && <p className="solving-page__warning">{t.closed}</p>}
              {available && !series.finished && series.startedAt === null && !feedback && <div className="solving-test__ready">
                <p>{t.startWhenReady}</p><button type="button" className="solving-button" disabled={busy} onClick={startFirstProblem}>{t.startTimer}</button>
              </div>}
              {puzzle && available && (series.startedAt !== null || feedback) && <div className="solving-test__board-layout">
                <ChessBoard key={`${activeDate}-${puzzle.id}`} fen={puzzle.fen} language={language}
                  disabled={busy || Boolean(feedback) || series.startedAt === null} onMove={submit} />
                <div className="solving-test__instructions"><h3>{t.whiteToMove}</h3><p>{t.goal}</p>
                  {feedback ? <div className={`solving-feedback ${feedback.correct ? 'solving-feedback--correct' : 'solving-feedback--wrong'}`} role="status">
                    <strong>{feedback.correct ? t.correct : feedback.move === null ? t.skipped : t.wrong}</strong>
                    <p>{feedback.san ? `${t.yourMove}: ${feedback.san}` : t.skipped}</p>
                    <p>{feedback.seconds} {t.seconds}</p>
                    {series.finished
                      ? <p>{t.resultsSoon}</p>
                      : <button type="button" className="solving-button" onClick={continueToNextProblem}>{t.next}</button>}
                  </div> : <><p className="solving-test__note">{t.immediate}</p>
                    <button type="button" className="solving-button solving-button--secondary" disabled={busy || series.startedAt === null}
                      onClick={() => submit(null)}>{t.skip}</button>
                  </>}
                </div>
              </div>}
              {series.finished && !feedback && <div className="solving-complete" role="status"><strong>{points} / 6 {t.points}</strong>
                <p>{t.totalTime}: {totalSeconds} {t.seconds}. {t.saved}</p>
                <button type="button" className="solving-button solving-button--secondary" onClick={exportResults}>{t.export}</button>
              </div>}
            </section>
            <div className="solving-panel">
              <div className="solving-results-toolbar"><span>{t.connected}</span><button type="button" onClick={refreshResults}>{t.refresh}</button></div>
              <SolvingResults rows={series.leaderboard} playerId={series.playerId} language={language} />
            </div>
            {series.canReview && !feedback ? <section className="solving-panel">
              <ProblemReview puzzles={series.puzzles} statistics={series.statistics} language={language} />
            </section> : <p className="solving-statistics-hint">{t.statisticsHint}</p>}
          </>}
        </div>
      </div>
      <section className="solving-statistics-toggle">
        <button type="button" className="solving-button solving-button--secondary" aria-expanded={showAllTimeStats}
          onClick={() => setShowAllTimeStats((value) => !value)}>{showAllTimeStats ? t.hideStats : t.showStats}</button>
        {showAllTimeStats && <><h2>{t.allTimeStats}</h2><SolvingHallOfFame language={language} /></>}
      </section>
    </main>
  );
}

export default SolvingPlatform;
