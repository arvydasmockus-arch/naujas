import { localizedError, interfaceText } from './russianTranslations.js';
import { useCallback, useEffect, useState } from 'react';
import ChessBoard from './ChessBoard';
import { sprintRequest } from './sprintApi';
import './SprintJudgePanel.css';

function SprintJudgePanel({ accessKey, language }) {
  const text = (lithuanian, english, russian) => language === 'ru' && russian ? russian : interfaceText(language, lithuanian, english);
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState('');
  const [round, setRound] = useState(null);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vilnius' }).format(new Date()));
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const refreshCatalog = useCallback(async () => {
    const data = await sprintRequest('judge/catalog', undefined, accessKey);
    setCatalog(data);
    setSelected((current) => data.rounds.some((item) => item.date === current) ? current : data.rounds.find((item) => item.date === data.today)?.date ?? data.rounds[0]?.date ?? '');
    return data;
  }, [accessKey]);

  useEffect(() => {
    let current = true;
    sprintRequest('judge/catalog', undefined, accessKey).then((data) => {
      if (!current) return;
      setCatalog(data); setSelected(data.rounds.find((item) => item.date === data.today)?.date ?? data.rounds[0]?.date ?? '');
    }).catch((problem) => { if (current) setError(problem.message); });
    return () => { current = false; };
  }, [accessKey]);

  useEffect(() => {
    let current = true;
    if (!selected) return undefined;
    sprintRequest(`judge/round?date=${encodeURIComponent(selected)}`, undefined, accessKey).then((data) => {
      if (current) setRound(data);
    }).catch((problem) => { if (current) setError(problem.message); });
    return () => { current = false; };
  }, [selected, accessKey]);

  async function perform(task) {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try { await task(); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }

  async function refresh() {
    await refreshCatalog();
    if (selected) setRound(await sprintRequest(`judge/round?date=${encodeURIComponent(selected)}`, undefined, accessKey));
  }

  function generate(event) {
    event.preventDefault();
    const total = Number(count);
    if (!Number.isInteger(total) || total < 1 || total > 30 || !date) return;
    perform(async () => {
      let created = 0;
      try {
        for (let index = 0; index < total; index++) {
          const day = new Date(Date.parse(`${date}T12:00:00Z`) + index * 86400000).toISOString().slice(0, 10);
          setStatus(`${text('Generuojama', 'Generating')}: ${index + 1}/${total} · ${day}`);
          const result = await sprintRequest('judge/generate', { date: day }, accessKey);
          created += Number(result.created);
        }
        setStatus(`${text('Sukurta', 'Created')}: ${created}. ${text('Jau esami rinkiniai išsaugoti.', 'Existing rounds were preserved.')}`);
      } catch (problem) {
        setStatus(`${text('Sukurta', 'Created')}: ${created}.`);
        throw problem;
      } finally { await refreshCatalog(); }
    });
  }

  function regenerate() {
    if (!round || round.date !== selected) return;
    const reset = round.sessions.length > 0;
    const message = reset
      ? text(`Pergeneruoti ${selected}? Bus pakeisti visi 3 uždaviniai ir ištrinti visi šios dienos žaidėjų atsakymai bei rezultatai.`, `Regenerate ${selected}? All 3 problems and every player session and result for this date will be replaced.`, `Создать турнир ${selected} заново? Все 3 задачи, ответы и результаты игроков за эту дату будут заменены.`)
      : text(`Pergeneruoti visus 3 uždavinius ${selected}?`, `Regenerate all 3 problems for ${selected}?`, `Заново создать все 3 задачи на ${selected}?`);
    if (!window.confirm(message)) return;
    perform(async () => {
      setRound(await sprintRequest('judge/regenerate', { date: selected, revision: round.revision, resetResults: reset }, accessKey));
      await refreshCatalog(); setStatus(text('Turnyras pergeneruotas.', 'Round regenerated.'));
    });
  }

  function deleteSession(item) {
    if (!window.confirm(text(`Pašalinti ${item.name} atsakymus ir rezultatą ${selected}?`, `Delete ${item.name}'s session and result for ${selected}?`, `Удалить ответы и результат игрока ${item.name} за ${selected}?`))) return;
    perform(async () => { await sprintRequest('judge/delete-session', { id: item.id }, accessKey); await refresh(); });
  }

  function deleteRound() {
    if (!round || round.date !== selected) return;
    if (!window.confirm(text(`Ištrinti ${selected} 3×#2 turnyrą? Bus pašalinti visi 3 uždaviniai ir visi šios dienos žaidėjų atsakymai bei rezultatai.`,
      `Delete the ${selected} 3×#2 round? All 3 problems and every player session and result for this date will be deleted.`, `Удалить турнир 3×#2 за ${selected}? Все 3 задачи, ответы и результаты игроков за эту дату будут удалены.`))) return;
    perform(async () => {
      await sprintRequest('judge/delete', { date: selected, revision: round.revision, confirmed: true }, accessKey);
      setRound(null);
      await refreshCatalog();
      setStatus(text('Turnyras ištrintas.', 'Round deleted.'));
    });
  }

  function deletePlayer(item) {
    if (!window.confirm(text(`Pašalinti ${item.name} iš „3×#2“? Bus ištrinti visi jo ${item.rounds} šio režimo turnyrų atsakymai ir rezultatai.`, `Remove ${item.name} from 3×#2? All ${item.rounds} of their sessions and results in this mode will be deleted.`, `Удалить игрока ${item.name} из 3×#2? Ответы и результаты всех его турниров (${item.rounds}) в этом режиме будут удалены.`))) return;
    perform(async () => { await sprintRequest('judge/delete-player', { playerId: item.id }, accessKey); await refresh(); });
  }

  const loaded = round?.date === selected;
  return <section className="sprint-judge" aria-label="3 × #2">
    {error && <p className="tournament-page__error" role="alert">{localizedError(error, language)}</p>}
    {status && <p role="status">{status}</p>}
    <form className="tournament-panel sprint-judge__generate" onSubmit={generate}>
      <h2>{text('Generuoti „3×#2“ turnyrus', 'Generate 3×#2 rounds')}</h2>
      <label>{text('Pirma diena', 'First date')}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={busy} /></label>
      <label>{text('Dienų skaičius', 'Number of days')}<input type="number" min={1} max={30} value={count} onChange={(event) => setCount(event.target.value)} required disabled={busy} /></label>
      <button disabled={busy}>{text('Generuoti', 'Generate')}</button>
      <p className="tournament-note">{text('Po vieną turnyrą kiekvienai dienai. Ateities turnyrai žaidėjams atsivers savo dieną.', 'One round per day. Future rounds become available to players on their scheduled date.')}</p>
    </form>
    <label className="tournament-selector">{text('Tvarkomas turnyras', 'Round to manage')}<select value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
      {!catalog?.rounds.length && <option value="">{text('Turnyrų dar nėra', 'No rounds yet')}</option>}
      {catalog?.rounds.map((item) => <option value={item.date} key={item.date}>{item.date} · {item.submitted}/{item.players}{item.date > catalog.today ? ` · ${text('Suplanuota', 'Scheduled')}` : ''}</option>)}
    </select></label>
    {loaded && <>
      <section className="tournament-panel"><div className="sprint-judge__actions"><h2>3 × #2 · {selected}</h2>
        <button disabled={busy} onClick={() => perform(refresh)}>{text('Atnaujinti', 'Refresh')}</button>
        <button disabled={busy} onClick={regenerate}>{text('Pergeneruoti 3 uždavinius', 'Regenerate 3 problems')}</button>
        <button className="sprint-judge__delete" disabled={busy} onClick={deleteRound}>{text('Ištrinti turnyrą', 'Delete round')}</button>
      </div></section>
      <div className="sprint-judge__problems">{round.puzzles.map((puzzle, index) => <article key={`${round.revision}-${puzzle.id}`} className="tournament-panel">
        <h3>{index + 1}. #2 · ({puzzle.whiteCount} + {puzzle.blackCount})</h3>
        <ChessBoard fen={puzzle.fen} disabled compact language={language} onMove={() => {}} />
        <p><strong>{puzzle.authors?.join(' · ')}</strong></p><p>1.{puzzle.keySan}!</p>
        <a href={puzzle.sourceUrl} target="_blank" rel="noopener noreferrer">YACPDB</a>
        <details><summary>{text('Sprendimas ir klystkeliai', 'Solution and tries')}</summary><pre>{puzzle.solution}</pre></details>
      </article>)}</div>
      <section className="tournament-panel"><h2>{text('Šios dienos žaidėjai', 'Players for this date')}</h2>
        <div className="sprint-judge__table"><table><thead><tr><th>{text('Žaidėjas', 'Player')}</th><th>{text('Būsena', 'Status')}</th><th>{text('Taškai', 'Points')}</th><th /></tr></thead>
          <tbody>{round.sessions.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.submittedAt == null ? text('Pradėta', 'Started') : text('Baigta', 'Completed')}</td>
            <td>{item.points ?? '—'}</td><td><button className="sprint-judge__delete" disabled={busy} onClick={() => deleteSession(item)}>{text('Pašalinti rezultatą', 'Delete result')}</button></td></tr>)}</tbody>
        </table></div>{!round.sessions.length && <p>{text('Žaidėjų dar nėra.', 'No players yet.')}</p>}
      </section>
    </>}
    <section className="tournament-panel"><h2>{text('Visi „3×#2“ žaidėjai', 'All 3×#2 players')}</h2>
      <div className="sprint-judge__table"><table><thead><tr><th>{text('Žaidėjas', 'Player')}</th><th>{text('Turnyrai', 'Rounds')}</th><th>{text('Baigta', 'Completed')}</th><th /></tr></thead>
        <tbody>{catalog?.players.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.rounds}</td><td>{item.submitted}</td><td>
          <button className="sprint-judge__delete" disabled={busy} onClick={() => deletePlayer(item)}>{text('Pašalinti iš „3×#2“', 'Remove from 3×#2')}</button>
        </td></tr>)}</tbody>
      </table></div>
    </section>
  </section>;
}

export default SprintJudgePanel;
