import { useCallback, useEffect, useState } from 'react';
import ChessBoard from './ChessBoard';
import TournamentResults from './TournamentResults';
import { tournamentRequest, downloadTournamentPdf } from './tournamentApi';
import { tournamentTranslations } from './tournamentTranslations';
import './TournamentPlatform.css';
import academyLogo from './assets/ml-academy-logo.jpg';
import ScoredSolution from './ScoredSolution';

const emptyResult = () => ({ name: '', country: 'LTU', category: '', rating: '', title: '', scores: Array(6).fill(''), minutes: 120, notes: '' });
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function remainingTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function TournamentPlatform({ language = 'en', onLanguageChange }) {
  const t = tournamentTranslations[language];
  const [judge, setJudge] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('set'));
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState(Array(6).fill(''));
  const [now, setNow] = useState(Date.now);
  const [offset, setOffset] = useState(0);
  const [generateTitle, setGenerateTitle] = useState('');
  const [generateDate, setGenerateDate] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vilnius' }).format(new Date()));
  const [mode, setMode] = useState('competition');
  const [title, setTitle] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [solutionsPublic, setSolutionsPublic] = useState(false);
  const [resultsPublic, setResultsPublic] = useState(false);
  const [scoringNotes, setScoringNotes] = useState(Array(6).fill(''));
  const [solutionDrafts, setSolutionDrafts] = useState(Array(6).fill(''));
  const [result, setResult] = useState(emptyResult);
  const key = judge ? accessKey : '';
  const storageKey = `ml-tournament-${selected}`;
  const expired = session ? now - offset >= session.deadline : false;

  const acceptEvent = useCallback((data) => {
    setEvent(data); setTitle(data.title); setSolutionsPublic(data.solutionsPublic); setResultsPublic(data.resultsPublic);
    setScoringNotes(data.puzzles.map((puzzle) => puzzle.scoringNotes ?? '')); setReviewed(false);
    setSolutionDrafts(data.puzzles.map((puzzle) => puzzle.solutionDraft ?? ''));
  }, []);
  const refreshCatalog = useCallback(async (signal) => {
    const data = await tournamentRequest('catalog', { key, signal, params: judge ? { judge: 1 } : {} });
    setCatalog(data);
    setSelected((current) => data.tournaments.some((item) => item.id === current) ? current : data.tournaments[0]?.id ?? null);
  }, [key, judge]);
  useEffect(() => {
    const controller = new AbortController();
    tournamentRequest('catalog', { key, signal: controller.signal, params: judge ? { judge: 1 } : {} }).then((data) => {
      if (controller.signal.aborted) return;
      setCatalog(data);
      setSelected((current) => data.tournaments.some((item) => item.id === current) ? current : data.tournaments[0]?.id ?? null);
    }).catch((problem) => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [key, judge]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    tournamentRequest('event', { key, signal: controller.signal, params: { id: selected, ...(judge ? { judge: 1 } : {}) } })
      .then(async (data) => {
        if (controller.signal.aborted) return;
        acceptEvent(data); setError(''); setResult(emptyResult());
        const local = stored(storageKey, {});
        setName(local.name ?? ''); setAnswers(local.answers ?? Array(6).fill('')); setSession(null);
        if (!judge && local.name && local.started) {
          const restored = await tournamentRequest('start', { signal: controller.signal, data: { id: selected, name: local.name } });
          if (controller.signal.aborted) return;
          setSession(restored); setOffset(Date.now() - restored.serverNow);
          if (restored.answers) setAnswers(restored.answers);
        }
      }).catch((problem) => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [selected, key, judge, storageKey, acceptEvent]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!selected || judge || !session) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ name: session.name, started: true, answers })); } catch { /* Optional local draft. */ }
  }, [selected, judge, session, storageKey, answers]);

  async function perform(task) {
    setBusy(true); setError('');
    try { return await task(); } catch (problem) { setError(problem.message); } finally { setBusy(false); }
  }
  function login(e) {
    e.preventDefault();
    perform(async () => { await tournamentRequest('judge/login', { key: accessKey, data: {} }); setEvent(null); setJudge(true); });
  }
  function generate(e) {
    e.preventDefault();
    perform(async () => {
      const data = await tournamentRequest('generate', { key, data: { title: generateTitle, date: generateDate, mode } });
      await refreshCatalog(); selectTournament(data.id); acceptEvent(data);
    });
  }
  function saveSettings(status = event.status) {
    perform(async () => {
      const data = await tournamentRequest('settings', { key, data: { id: selected, title, status, judgeReviewed: reviewed, solutionsPublic, resultsPublic, scoringNotes, solutionDrafts } });
      acceptEvent(data); await refreshCatalog();
    });
  }
  function saveResult(e) {
    e.preventDefault();
    perform(async () => {
      const edited = { ...result, scores: result.scores.map((score) => score === '' ? null : Number(score)), minutes: Number(result.minutes) };
      acceptEvent(await tournamentRequest('result', { key, data: { tournamentId: selected, result: edited } })); setResult(emptyResult());
    });
  }
  function start(e) {
    e.preventDefault();
    perform(async () => { const data = await tournamentRequest('start', { data: { id: selected, name } }); setSession(data); setOffset(Date.now() - data.serverNow); });
  }
  function answerText() {
    return `${event.displayTitle}\nPlayer: ${session?.name ?? name}\n120-minute solving session\n\n` + answers.map((answer, index) => `${index + 1}. ${event.puzzles[index].stipulation}\n${answer || '—'}`).join('\n\n');
  }
  function downloadText() {
    const url = URL.createObjectURL(new Blob([answerText()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ML-Academy-No-${event.number}-answers-${event.date}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function mail() {
    const text = answerText();
    // Long solutions are attached as a downloaded text file, avoiding mailto URL truncation.
    const body = text.length < 1800 ? text : `Player: ${session?.name ?? name}\n${event.displayTitle}\nPlease attach the downloaded answers .txt file containing all six solutions.`;
    if (text.length >= 1800) downloadText();
    window.location.href = `mailto:arvydas.mockus@gmail.com?subject=${encodeURIComponent(`${event.displayTitle} — ${session?.name ?? name}`)}&body=${encodeURIComponent(body)}`;
  }
  function submit(e) {
    e.preventDefault();
    perform(async () => {
      const receipt = await tournamentRequest('submit', { data: { id: selected, sessionId: session.id, answers } });
      setSession((current) => ({ ...current, submittedAt: receipt.submittedAt })); mail();
    });
  }
  function pdf(kind, id = selected) {
    perform(async () => {
      if (judge && kind === 'solutions' && id === selected) {
        const saved = await tournamentRequest('settings', { key, data: { id: selected, scoringNotes, solutionDrafts } });
        setEvent(saved);
      }
      await downloadTournamentPdf(id, kind, key);
    });
  }
  function selectTournament(id) {
    if (id !== selected) { setEvent(null); setSelected(id); }
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'training'); url.searchParams.set('set', id);
    window.history.replaceState(null, '', url);
  }

  return <main className="tournament-page" lang={language}>
    <header className="tournament-page__header"><div><h1>{t.title}</h1><p>{t.subtitle}</p><small>{t.schedule}</small></div>
      <select aria-label={language === 'lt' ? 'Kalba' : 'Language'} value={language} onChange={(e) => onLanguageChange(e.target.value)}><option value="en">English</option><option value="lt">Lietuvių</option></select></header>
    <div className="tournament-page__views"><strong>{judge ? t.judgeView : t.playerView}</strong>
      {judge ? <button type="button" onClick={() => { setJudge(false); setEvent(null); setAccessKey(''); }}>{t.logout}</button> :
        <details><summary>{t.judgeView}</summary><form onSubmit={login}><label>{t.access}<input type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} required /></label><button disabled={busy}>{t.login}</button><p>{t.keyHint}</p></form></details>}
    </div>
    {error && <p className="tournament-page__error" role="alert">{error}</p>}
    {judge && <form className="tournament-panel tournament-generate" onSubmit={generate}>
      <label>{t.tournamentTitle}<input value={generateTitle} onChange={(e) => setGenerateTitle(e.target.value)} maxLength={140} placeholder="ML Academy" /></label>
      <label>{t.date}<input type="date" value={generateDate} onChange={(e) => setGenerateDate(e.target.value)} required /></label>
      <select aria-label={t.competition} value={mode} onChange={(e) => setMode(e.target.value)}><option value="competition">{t.competition}</option><option value="training">{t.training}</option></select>
      <button disabled={busy}>{t.generate}</button><p>{t.pool}: {catalog?.pool?.map((item) => `${item.type}: ${item.count}`).join(' · ')}. {t.importHint}</p>
    </form>}
    <label className="tournament-selector">{t.choose}<select disabled={busy} value={selected ?? ''} onChange={(e) => selectTournament(e.target.value)}>
      <option value="" disabled>{t.choose}</option>{catalog?.tournaments.map((item) => <option key={item.id} value={item.id}>{item.displayTitle} · {t[item.mode]}{item.status === 'draft' ? ` · ${t.draft}` : ''}</option>)}</select></label>
    {!event ? <p>{catalog?.tournaments.length ? t.loading : t.noEvents}</p> : <>
      <section className="tournament-panel"><div className="tournament-event-heading"><div className="tournament-set-brand"><img src={academyLogo} alt="ML Academy" /><div><h2>{event.displayTitle}</h2><p>{t[event.mode]} · 120 min</p></div></div>
        <div className="tournament-downloads"><button disabled={busy} onClick={() => pdf('problems')}>{t.problems}</button>
          {(judge || event.solutionsPublic) && <button disabled={busy} onClick={() => pdf('solutions')}>{t.solutions}</button>}
          {(judge || event.resultsPublic) && <button disabled={busy} onClick={() => pdf('results')}>{t.resultsPdf}</button>}</div></div>
        <p>{t.ready}</p>
        {!judge && !event.solutionsPublic && <p className="tournament-note">{t.unavailable}</p>}
      </section>
      {judge && <section className="tournament-panel"><h2>{t.settings}</h2><label>{t.tournamentTitle}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} /></label>
        <label className="tournament-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />{t.review}</label>
        <label className="tournament-check"><input type="checkbox" checked={solutionsPublic} onChange={(e) => setSolutionsPublic(e.target.checked)} />{t.publishSolutions}</label>
        <label className="tournament-check"><input type="checkbox" checked={resultsPublic} onChange={(e) => setResultsPublic(e.target.checked)} />{t.publishResults}</label>
        <div className="tournament-downloads"><button disabled={busy} onClick={() => saveSettings()}>{t.saveSettings}</button>
          <button disabled={busy || (event.mode === 'competition' && event.status === 'draft' && !reviewed)} onClick={() => saveSettings(event.status === 'draft' ? 'published' : 'draft')}>{event.status === 'draft' ? t.publish : t.hide}</button></div>
        <p className="tournament-note">{t.usage}</p>
      </section>}
      {!judge && <section className="tournament-panel">
        {!session ? <form className="tournament-start" onSubmit={start}><label>{t.name}<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={40} required /></label><button disabled={busy}>{t.start}</button></form>
          : <div className="tournament-clock"><strong>{session.name}</strong><span>{t.remaining}: {remainingTime(session.deadline - (now - offset))}</span>{session.submittedAt && <p role="status">{t.submitted}</p>}{expired && !session.submittedAt && <p>{t.deadline}</p>}</div>}
      </section>}
      <section className="tournament-problems">{event.puzzles.map((puzzle, index) => <article className="tournament-panel tournament-problem" key={`${selected}-${index}-${puzzle.fen}`}>
        <h2>{index + 1}.</h2>
        <div className="tournament-diagram">
          <ChessBoard fen={puzzle.fen} disabled compact language={language} description={`${t.problem} ${index + 1}: ${puzzle.stipulation}`} onMove={() => {}} />
          <div className="tournament-diagram__caption"><span>{puzzle.stipulation}</span>
            {puzzle.solutions ? <small>{puzzle.solutions} {language === 'lt' ? 'sprendiniai' : 'solutions'}</small> : <span />}
            <span>({puzzle.whiteCount} + {puzzle.blackCount})</span>
          </div>
        </div>
        {(judge || event.solutionsPublic) && <div className="tournament-source"><strong>{puzzle.authors.join(' · ')}</strong><p>{puzzle.source} {puzzle.year} · <a href={puzzle.sourceUrl} target="_blank" rel="noopener noreferrer">YACPDB #{puzzle.id}</a></p>
          <details><summary>{judge ? t.originalSolution : language === 'lt' ? 'Sprendimas' : 'Solution'}</summary>{judge ? <pre>{puzzle.solution}</pre> : <ScoredSolution text={puzzle.solutionDraft} />}</details></div>}
        {judge && <><label>{t.draftSolution}<textarea className="tournament-solution-editor" rows={6} value={solutionDrafts[index]} onChange={(e) => setSolutionDrafts((drafts) => drafts.map((draft, i) => i === index ? e.target.value : draft))} maxLength={20000} /></label>
          <p className="tournament-note">{t.draftHelp}</p>
          {puzzle.draftWarnings?.length > 0 && <p className="tournament-draft-warning">{t.draftReview}</p>}
          <ScoredSolution text={solutionDrafts[index]} />
          <button disabled={busy} onClick={() => perform(async () => acceptEvent(await tournamentRequest('settings', { key, data: { id: selected, solutionDrafts, scoringNotes } })))}>{t.saveDrafts}</button>
          <label>{t.notes}<textarea rows={3} value={scoringNotes[index]} onChange={(e) => setScoringNotes((notes) => notes.map((note, i) => i === index ? e.target.value : note))} maxLength={4000} /></label>
          {event.status === 'draft' && <button disabled={busy} onClick={() => perform(async () => acceptEvent(await tournamentRequest('replace', { key, data: { id: selected, ordinal: index } })))}>{t.replace}</button>}</>}
      </article>)}</section>
      {!judge && session && <form className="tournament-panel tournament-answers" onSubmit={submit}><h2>{t.answers}</h2><p>{t.answerHint}</p>
        <div>{answers.map((answer, index) => <label key={index}>{t.problem} {index + 1} · {event.puzzles[index].stipulation}
          <textarea rows={5} value={answer} disabled={busy || expired || Boolean(session.submittedAt)} maxLength={10000} onChange={(e) => setAnswers((all) => all.map((value, i) => i === index ? e.target.value : value))} /></label>)}</div>
        <p>{t.emailNotice}</p><div className="tournament-downloads"><button disabled={busy || expired || Boolean(session.submittedAt)}>{t.send}</button>
          <button type="button" onClick={downloadText}>{t.textDownload}</button>{session.submittedAt && <button type="button" onClick={mail}>{t.mail}</button>}</div>
      </form>}
      <section className="tournament-panel"><TournamentResults event={event} language={language} judge={judge}
        onEdit={(row) => setResult({ ...row, scores: row.scores.map((score) => score ?? '') })}
        onDelete={(resultId) => perform(async () => acceptEvent(await tournamentRequest('delete-result', { key, data: { tournamentId: selected, resultId } })))} /></section>
      {judge && <>
        <form className="tournament-panel tournament-result-form" onSubmit={saveResult}><h2>{t.manual}</h2><div className="tournament-result-fields">
          {['name', 'country', 'category', 'rating', 'title'].map((field) => <label key={field}>{field === 'title' ? t.titleShort : t[field]}<input value={result[field]} required={field === 'name'} onChange={(e) => setResult((current) => ({ ...current, [field]: e.target.value }))} /></label>)}
          <label>{t.minutes}<input type="number" min="0" max="120" step="0.01" required value={result.minutes} onChange={(e) => setResult((current) => ({ ...current, minutes: e.target.value }))} /></label></div>
          <p>{t.scores}</p><div className="tournament-scores">{result.scores.map((score, index) => <label key={index}>{index + 1}.<input type="number" min="0" max="5" step="any" value={score} onChange={(e) => setResult((current) => ({ ...current, scores: current.scores.map((value, i) => i === index ? e.target.value : value) }))} /></label>)}</div>
          <label>{t.notesResult}<textarea rows={2} value={result.notes} onChange={(e) => setResult((current) => ({ ...current, notes: e.target.value }))} /></label>
          <div className="tournament-downloads"><button disabled={busy}>{t.saveResult}</button><button type="button" onClick={() => setResult(emptyResult())}>{t.reset}</button></div>
        </form>
        <section className="tournament-panel"><h2>{t.submissions}</h2>{!event.submissions?.length && <p>{t.noSubmissions}</p>}
          {event.submissions?.map((submission) => <details className="tournament-submission" key={submission.id}><summary>{submission.name} · {submission.minutes.toFixed(2)} min</summary>
            {submission.answers.map((answer, index) => <div key={index}><strong>{index + 1}.</strong><pre>{answer || '—'}</pre></div>)}
            <button onClick={() => setResult({ ...emptyResult(), name: submission.name, minutes: Number(submission.minutes.toFixed(2)) })}>{t.manual}</button></details>)}
        </section>
      </>}
    </>}
    <section className="tournament-panel tournament-history" aria-label={t.history}>
      <h2>{t.history}</h2><p>{t.historyHint}</p>
      <div className="tournament-history__list">{catalog?.tournaments.map((item) => <article key={item.id} className={item.id === selected ? 'tournament-history__selected' : ''}>
        <div><strong>{item.displayTitle}</strong><p>{t[item.mode]}{item.status === 'draft' ? ` · ${t.draft}` : ''}</p></div>
        <div className="tournament-downloads"><button disabled={busy} type="button" onClick={() => { selectTournament(item.id); document.querySelector('.tournament-selector')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t.openSet}</button>
          <button disabled={busy} type="button" onClick={() => pdf('problems', item.id)}>{t.problems}</button>
          {(judge || item.solutionsPublic) && <button disabled={busy} type="button" onClick={() => pdf('solutions', item.id)}>{t.solutions}</button>}
          {(judge || item.resultsPublic) && <button disabled={busy} type="button" onClick={() => pdf('results', item.id)}>{t.resultsPdf}</button>}
          {!judge && !item.resultsPublic && <small>{t.results}: {t.notReleased}</small>}
        </div>
      </article>)}</div>
      {!catalog?.tournaments.length && <p>{t.noEvents}</p>}
    </section>
  </main>;
}
export default TournamentPlatform;
