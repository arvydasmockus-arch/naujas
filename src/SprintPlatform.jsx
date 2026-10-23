import { localizedError, interfaceText, russianLabels } from './russianTranslations.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from './ChessBoard';
import SprintProblemReview from './SprintProblemReview';
import SprintCalendar from './SprintCalendar';
import SolvingHallOfFame from './SolvingHallOfFame';
import { sprintRequest } from './sprintApi';
import { sprintTranslations } from './sprintTranslations';
import { sprintToday } from './sprintDate';
import './SprintPlatform.css';

const emptyAnswers = () => ['', '', ''];
const storageKey = (date, accountId) => `ml-sprint-20-${accountId ? `${accountId}-` : ''}${date}`;
const resultLabels = {
  en: { problemStatus: 'Result', seconds: 'sec', correct: 'Solved', wrong: 'Not solved', skipped: 'No answer',
    problemStatistics: 'Problem statistics', solvedBy: 'Solved', failedBy: 'Not solved', averageCorrect: 'Avg. correct time',
    wrongMoves: 'Incorrect answers', move: 'Move', count: 'Count', solution: 'Solution' },
  lt: { problemStatus: 'Rezultatas', seconds: 'sek.', correct: 'Išspręsta', wrong: 'Neišspręsta', skipped: 'Atsakymo nėra',
    problemStatistics: 'Uždavinio statistika', solvedBy: 'Išsprendė', failedBy: 'Neišsprendė', averageCorrect: 'Teisingo sprendimo vidurkis',
    wrongMoves: 'Klaidingi atsakymai', move: 'Ėjimas', count: 'Kiekis', solution: 'Sprendimas' },
};

resultLabels.ru = russianLabels(resultLabels.en);
function readSaved(date, accountId) {
  try { return JSON.parse(localStorage.getItem(storageKey(date, accountId))) ?? {}; } catch { return {}; }
}
function normalizedName(name) { return name.normalize('NFKC').trim().replace(/\s+/g, ' '); }
function timeText(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function tableRows(rows, t, kind) {
  if (!rows.length) return <p className="sprint-empty">{kind === 'winners' ? t.noWinners : t.noResults}</p>;
  if (kind === 'daily') return <div className="sprint-table-wrap sprint-table-wrap--daily"><table><thead>
    <tr><th>{t.place}</th><th>{t.player}</th>{Array.from({ length: 3 }, (_, index) => <th key={index}>{index + 1}.</th>)}
      <th>{t.points}</th><th>{t.elapsed}</th></tr>
  </thead><tbody>{rows.map((row) => <tr key={row.name}>
    <td>{row.rank}.</td><th scope="row" title={row.name}>{row.name}</th>
    {(row.results ?? []).map((result, index) => <td key={index} className={result.correct ? 'sprint-result-correct' : result.answered ? 'sprint-result-wrong' : ''}
        title={result.correct ? t.correct : result.answered ? t.wrong : t.skipped}>
        <span>{result.correct ? '✓' : result.answered ? '×' : '—'}</span><small>{timeText(result.seconds)}</small></td>)}
    <td><strong>{row.points}</strong></td><td>{timeText(row.elapsedSeconds)}</td>
  </tr>)}</tbody></table></div>;
  if (kind === 'overall') return <div className="sprint-table-wrap"><table><thead><tr>
    <th>{t.place}</th><th>{t.player}</th><th>{t.rounds}</th><th>{t.points}</th><th>{t.averageTime}</th>
  </tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
    <td>{row.rank}.</td><th scope="row">{row.name}</th><td>{row.rounds}</td><td><strong>{row.points}</strong></td><td>{timeText(row.averageSeconds)}</td>
  </tr>)}</tbody></table></div>;
  return <div className="sprint-table-wrap"><table><thead><tr>
    <th>{kind === 'winners' ? t.date : t.place}</th><th>{t.player}</th><th>{t.points}</th>
    {kind === 'overall' && <th>{t.rounds}</th>}<th>{kind === 'overall' ? t.averageTime : t.elapsed}</th>
  </tr></thead><tbody>{rows.map((row, index) => <tr key={`${kind}-${row.date ?? row.id ?? row.name}-${index}`}>
    <td>{kind === 'winners' ? row.date : row.rank}</td><th scope="row">{row.name}</th><td>{row.points}</td>
    {kind === 'overall' && <td>{row.rounds}</td>}<td>{timeText(kind === 'overall' ? row.averageSeconds : row.elapsedSeconds)}</td>
  </tr>)}</tbody></table></div>;
}

function SprintPlatform({ language = 'en', accountUser = null, accountsEnabled = false }) {
  const t = { ...sprintTranslations[language], ...resultLabels[language] };
  const [round, setRound] = useState(null);
  const [selectedDate, setSelectedDate] = useState(sprintToday);
  const roundAction = `round?date=${encodeURIComponent(selectedDate)}`;
  const [player, setPlayer] = useState('');
  const [draftName, setDraftName] = useState(accountUser?.username || '');
  const [calendar, setCalendar] = useState(null);
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState(emptyAnswers);
  const [problemSeconds, setProblemSeconds] = useState([null, null, null]);
  const [boardAnswers, setBoardAnswers] = useState(emptyAnswers);
  const [boardVersions, setBoardVersions] = useState([0, 0, 0]);
  const [now, setNow] = useState(Date.now);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submission = useRef(false);
  const autoSubmitted = useRef(null);
  const remaining = session ? Math.max(0, session.deadline - (now - offset)) : 0;
  const submitted = Boolean(session?.submittedAt);
  const calendarName = normalizedName(session?.name || draftName);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('sprintDate', selectedDate);
    window.history.replaceState(null, '', url);
  }, [selectedDate]);

  useEffect(() => {
    let current = true;
    const name = calendarName.length >= 2 && calendarName.length <= 40 ? calendarName : '';
    const timer = setTimeout(async () => {
      try {
        const data = await sprintRequest(`calendar?name=${encodeURIComponent(name)}`);
        if (current) setCalendar(data);
      } catch (problem) { if (current) setError(problem.message); }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [calendarName, session?.submittedAt]);

  const refreshRound = useCallback(async (sessionId = session?.id) => {
    const base = roundAction === 'round' && session?.date ? `round?date=${encodeURIComponent(session.date)}` : roundAction;
    const action = sessionId ? `${base}${base.includes('?') ? '&' : '?'}sessionId=${encodeURIComponent(sessionId)}` : base;
    const data = await sprintRequest(action);
    if (sessionId && session?.id === sessionId && data.sessionStatus === 'missing') {
      setSession(null); setAnswers(emptyAnswers()); setProblemSeconds([null, null, null]);
      setBoardAnswers(emptyAnswers()); setBoardVersions([0, 0, 0]);
      try { localStorage.removeItem(storageKey(data.date, accountUser?.id)); } catch { /* Server data remains authoritative. */ }
    }
    setRound(data);
    return data;
  }, [roundAction, session, accountUser]);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const data = await sprintRequest(roundAction);
        if (!current) return;
        setRound(data);
      } catch (problem) { if (current) setError(problem.message || t.error); }
    }
    load();
    return () => { current = false; };
  }, [t.error, roundAction]);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (!round || !player) return;
    try {
      localStorage.setItem(storageKey(round.date, accountUser?.id), JSON.stringify({ name: player, started: Boolean(session), answers, problemSeconds }));
    }
    catch { /* The server retains submitted results; local storage only keeps an in-progress draft. */ }
  }, [round, player, session, answers, problemSeconds, accountUser?.id]);

  async function start(event) {
    event.preventDefault();
    if (accountsEnabled && !accountUser) return;
    const name = (accountUser?.username || draftName).normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40 || busy) return;
    setBusy(true); setError('');
    try {
      const saved = readSaved(round.date, accountUser?.id);
      const restoreDraft = saved.started && normalizedName(saved.name || '').toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US');
      const data = await sprintRequest('start', { name, date: round.date });
      setPlayer(data.name); setDraftName(data.name); setSession(data); setOffset(Date.now() - data.serverNow);
      setAnswers(data.answers ?? (restoreDraft ? saved.answers : null) ?? emptyAnswers());
      setProblemSeconds(data.problemSeconds ?? (restoreDraft ? saved.problemSeconds : null) ?? [null, null, null]);
      setBoardAnswers(emptyAnswers()); setBoardVersions([0, 0, 0]);
      await refreshRound();
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }

  const submit = useCallback(async () => {
    if (!session || submitted || submission.current) return;
    submission.current = true; setBusy(true); setError('');
    try {
      const data = await sprintRequest('submit', { sessionId: session.id, answers, problemSeconds });
      setSession((current) => ({ ...current, ...data }));
      setOffset(Date.now() - data.serverNow);
      await refreshRound(data.id);
    } catch (problem) { setError(problem.message); }
    finally { submission.current = false; setBusy(false); }
  }, [session, submitted, answers, problemSeconds, refreshRound]);

  useEffect(() => {
    if (!session || submitted || remaining !== 0 || busy) return undefined;
    if (autoSubmitted.current === session.id) return undefined;
    autoSubmitted.current = session.id;
    const timeout = setTimeout(submit, 0);
    return () => clearTimeout(timeout);
  }, [session, submitted, remaining, busy, submit]);

  function editAnswer(index, value) {
    if (boardAnswers[index] && value !== boardAnswers[index]) {
      setBoardAnswers((current) => current.map((answer, i) => i === index ? '' : answer));
      setBoardVersions((current) => current.map((version, i) => i === index ? version + 1 : version));
    }
    setAnswers((current) => current.map((answer, i) => i === index ? value : answer));
    setProblemSeconds((current) => current.map((seconds, i) => i === index
      ? (value.trim() && session ? Math.min(1200, Math.max(0, Math.floor((Date.now() - offset - session.startedAt) / 1000))) : null) : seconds));
  }

  function handleBoardMove(index, lan, puzzle) {
    try {
      const move = new Chess(puzzle.fen).move(lan);
      setAnswers((current) => current.map((answer, i) => i === index ? move.san : answer));
      setBoardAnswers((current) => current.map((answer, i) => i === index ? move.san : answer));
      setProblemSeconds((current) => current.map((seconds, i) => i === index
        ? Math.min(1200, Math.max(0, Math.floor((Date.now() - offset - session.startedAt) / 1000))) : seconds));
    } catch { setError(t.invalidMove); }
  }

  function undoMove(index) {
    setAnswers((current) => current.map((answer, i) => i === index ? '' : answer));
    setBoardAnswers((current) => current.map((answer, i) => i === index ? '' : answer));
    setBoardVersions((current) => current.map((version, i) => i === index ? version + 1 : version));
    setProblemSeconds((current) => current.map((seconds, i) => i === index ? null : seconds));
  }

  function switchPlayer() {
    if (round) localStorage.removeItem(storageKey(round.date, accountUser?.id));
    try { localStorage.removeItem('ml-sprint-player'); } catch { /* Player switching remains available without storage. */ }
    setSession(null); setPlayer(''); setDraftName(accountUser?.username || ''); setAnswers(emptyAnswers()); setBoardAnswers(emptyAnswers());
  }

  return <main className="sprint-page" lang={language}>
    <header className="sprint-header"><div><span>ML Academy</span><h1>{t.title}</h1><p>{t.subtitle}</p></div></header>
    {error && <div className="sprint-error" role="alert">{localizedError(error, language)}</div>}
    {round && <SprintCalendar dates={round.dates ?? calendar?.dates ?? [round.date]}
      completedDates={calendar?.name === calendarName ? calendar.completedDates : []}
      selectedDate={round.date} playerName={calendarName} language={language}
      disabled={busy || Boolean(session && !submitted)} onSelect={(date) => {
        if (date === round.date) return;
        setSelectedDate(date); setRound(null); setSession(null); setPlayer('');
        setAnswers(emptyAnswers()); setProblemSeconds([null, null, null]);
        setBoardAnswers(emptyAnswers()); setBoardVersions([0, 0, 0]); setError('');
        autoSubmitted.current = null;
      }}>
    {!session && <div className="sprint-start-panel">
      <form onSubmit={start}>{accountsEnabled ? <p>{accountUser ? accountUser.username : interfaceText(language, 'Norėdami spręsti, prisijunkite.', 'Log in to start solving.')}</p> : <label>{t.name}<input autoComplete="off" value={draftName} minLength={2} maxLength={40} required
        onChange={(event) => setDraftName(event.target.value)} /></label>}
        <button type="submit" disabled={busy || draftName.trim().length < 2 || (accountsEnabled && !accountUser)}>{busy ? '…' : t.start}</button></form>
      <p>{t.submitHint}</p>
    </div>}
    </SprintCalendar>}
    {!round && !error && <section className="sprint-panel">{t.error}</section>}
    {round && session && <>
      <section className="sprint-session-bar" aria-live="polite">
        <strong>{session.name}</strong>
        {!submitted ? <><span className={remaining < 60000 ? 'sprint-time sprint-time--urgent' : 'sprint-time'}>{t.remaining}: {timeText(Math.ceil(remaining / 1000))}</span>
          <button type="button" disabled={busy} onClick={submit}>{t.submit}</button></> : <>
          <span className="sprint-session-bar__result">{t.submitted}: {session.points}/3 · {t.elapsed}: {timeText(session.elapsedSeconds)}</span>
          <button type="button" className="sprint-button--secondary" onClick={switchPlayer}>{t.switchPlayer}</button>
        </>}
      </section>
      <p className="sprint-submit-hint">{t.submitHint}</p>
      <section className="sprint-problems" aria-label={t.title}>
        {session.puzzles.map((puzzle, index) => <article className="sprint-panel sprint-problem" key={`${round.date}-${puzzle.id}`}>
          <h2>{t.problem} {index + 1}</h2>
          <div className="sprint-board-wrap">
            <ChessBoard key={`${puzzle.id}-${boardVersions[index]}`} fen={puzzle.fen} language={language}
              disabled={submitted || remaining === 0 || busy} compact description={`${t.problem} ${index + 1}, mate in two`}
              onMove={(lan) => handleBoardMove(index, lan, puzzle)} />
            <div className="sprint-caption"><span>#2</span><span>({puzzle.whiteCount} + {puzzle.blackCount})</span></div>
          </div>
          {!submitted && <label className="sprint-answer">{t.yourMove}
            <input value={answers[index]} maxLength={100}
              disabled={submitted || remaining === 0 || busy} onChange={(event) => editAnswer(index, event.target.value)} />
          </label>}
          {!submitted && answers[index] && <div className="sprint-answer-actions">
            <button type="button" className="sprint-button--secondary" disabled={remaining === 0 || busy}
              onClick={() => undoMove(index)}>{t.undoMove}</button>
          </div>}
          {submitted && <SprintProblemReview puzzle={session.reviewPuzzles?.[index]} language={language}
            statistics={round.problemStatistics?.[index]?.moves ? round.problemStatistics[index] : session.problemStatistics?.[index]} />}
        </article>)}
      </section>
    </>}
    {round && <div className="sprint-results-grid">
      <section className="sprint-panel"><h2>{t.daily}</h2>{tableRows(round.dailyResults, t, 'daily')}</section>
      <section className="sprint-panel sprint-panel--winners"><h2>{t.winners}</h2>{tableRows(round.dailyWinners, t, 'winners')}</section>
    </div>}
    <SolvingHallOfFame language={language} mode="sprint" dates={round?.dates ?? []} />
  </main>;
}

export default SprintPlatform;
