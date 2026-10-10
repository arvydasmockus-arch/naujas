import { useEffect, useMemo, useState } from 'react';
import { getSolvingLeaderboard, getSolvingPlayerHistory } from './solvingApi';
import './SolvingHallOfFame.css';

const labels = {
  en: {
    title: 'All-time #2 leaderboard', subtitle: 'Combined results from every daily series. Select a solver to see their day-by-day record.',
    sort: 'Rank by', rate: 'Success rate', solved: 'Most solved', errorsSort: 'Fewest errors', speed: 'Fastest average',
    place: 'Place', player: 'Solver', testsPlayed: 'Tests played', problems: 'Problems', correct: 'Correct',
    wrongMoves: 'Wrong moves', average: 'Avg sec/problem', totalTime: 'Total time', success: 'Success',
    daily: 'Daily record', date: 'Date', key: 'Key', seconds: 'Sec', points: 'Points', total: 'Total', close: 'Close',
    wrong: 'Incorrect', loadError: 'Could not load the overall results.', noPlayers: 'No solved problems yet.',
    noHistory: 'No answered problems for this player yet.', allDays: 'All recorded days',
  },
  lt: {
    title: 'Visų dienų #2 lentelė', subtitle: 'Sukaupti visų dienos serijų rezultatai. Paspauskite žaidėjo vardą, kad pamatytumėte jo dienų istoriją.',
    sort: 'Rikiuoti pagal', rate: 'Geriausią procentą', solved: 'Išspręstų skaičių', errorsSort: 'Mažiausiai klaidų', speed: 'Greičiausią vidurkį',
    place: 'Vieta', player: 'Žaidėjas', testsPlayed: 'Turnyrai žaista', problems: 'Uždaviniai', correct: 'Teisingi',
    wrongMoves: 'Klaidingi ėjimai', average: 'Vid. sek./užd.', totalTime: 'Visas laikas', success: 'Sėkmė',
    daily: 'Dienų rezultatai', date: 'Data', key: 'Ėjimas', seconds: 'Sek.', points: 'Taškai', total: 'Iš viso', close: 'Uždaryti',
    wrong: 'Neteisinga', loadError: 'Nepavyko įkelti bendrų rezultatų.', noPlayers: 'Išspręstų uždavinių dar nėra.',
    noHistory: 'Šis žaidėjas dar nepateikė atsakymų.', allDays: 'Visa sukaupta istorija',
  },
};

const number = (value, language) => Number(value || 0).toLocaleString(language === 'lt' ? 'lt-LT' : 'en-GB');
function duration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(seconds / 3600);
  return `${String(hours).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
}
function dateLabel(value, language) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(language === 'lt' ? 'lt-LT' : 'en-GB',
    { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}

function SolvingHallOfFame({ language = 'en' }) {
  const t = labels[language];
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState('success');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const load = (signal) => getSolvingLeaderboard(signal).then((data) => { setRows(data.rows); setError(''); })
      .catch((problem) => { if (problem.name !== 'AbortError') setError(problem.message || t.loadError); });
    load(controller.signal);
    const timer = setInterval(() => load(), 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [t.loadError]);

  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController();
    getSolvingPlayerHistory(selected.name, controller.signal).then(setHistory)
      .catch((problem) => { if (problem.name !== 'AbortError') setHistoryError(problem.message || t.noHistory); });
    return () => controller.abort();
  }, [selected, t.noHistory]);

  const ranked = useMemo(() => {
    const comparators = {
      success: (a, b) => b.success - a.success || b.problems - a.problems || b.correct - a.correct,
      solved: (a, b) => b.correct - a.correct || b.success - a.success || a.errors - b.errors,
      errors: (a, b) => a.wrongMoves - b.wrongMoves || b.success - a.success || b.problems - a.problems,
      speed: (a, b) => (a.problems === 0) - (b.problems === 0) || a.averageSeconds - b.averageSeconds || b.problems - a.problems || b.success - a.success,
    };
    return [...rows].sort(comparators[sort]);
  }, [rows, sort]);

  function togglePlayer(row) {
    if (selected?.id === row.id) setSelected(null);
    else { setSelected({ id: row.id, name: row.name }); setHistory(null); setHistoryError(''); }
  }

  return <section className="solving-panel solving-hall" aria-labelledby="solving-hall-title">
    <div className="solving-hall__heading"><div><h2 id="solving-hall-title">{t.title}</h2><p>{t.subtitle}</p></div>
      <label>{t.sort}<select value={sort} onChange={(event) => setSort(event.target.value)}>
        <option value="success">{t.rate}</option><option value="solved">{t.solved}</option>
        <option value="errors">{t.errorsSort}</option><option value="speed">{t.speed}</option>
      </select></label>
    </div>
    {error && <p className="solving-hall__error" role="alert">{error}</p>}
    <div className="solving-hall__scroll" tabIndex={0} role="region" aria-label={t.title}>
      <table><thead><tr><th>{t.place}</th><th>{t.player}</th><th>{t.testsPlayed}</th><th>{t.problems}</th><th>{t.correct}</th><th>{t.wrongMoves}</th><th>{t.average}</th><th>{t.totalTime}</th><th>{t.success}</th></tr></thead>
        <tbody>{ranked.map((row, index) => <tr key={row.id} className={selected?.id === row.id ? 'solving-hall__selected' : ''}>
          <td>{index + 1}.</td><th scope="row"><button type="button" className="solving-hall__player" onClick={() => togglePlayer(row)} aria-expanded={selected?.id === row.id}>{row.name}</button></th>
          <td>{number(row.testsPlayed, language)}</td><td>{number(row.problems, language)}</td><td>{number(row.correct, language)}</td><td>{number(row.wrongMoves, language)}</td>
          <td>{Number(row.averageSeconds || 0).toFixed(2)}</td><td>{duration(row.totalSeconds)}</td><td><strong>{Number(row.success || 0).toFixed(2)}%</strong></td>
        </tr>)}
        {!ranked.length && <tr><td colSpan="9">{t.noPlayers}</td></tr>}</tbody>
      </table>
    </div>

    {selected && <section className="solving-hall__profile" aria-live="polite">
      <div className="solving-hall__profile-heading"><div><h3>{selected.name}</h3><p>{t.allDays}</p></div>
        <button type="button" className="solving-button solving-button--secondary" onClick={() => { setSelected(null); setHistory(null); }}>{t.close}</button></div>
      {!history && !historyError && <p>{language === 'lt' ? 'Įkeliama…' : 'Loading…'}</p>}
      {historyError && <p className="solving-hall__error" role="alert">{historyError}</p>}
      {history && <>
        <h3>{t.daily}</h3>
        <div className="solving-hall__scroll solving-hall__history" tabIndex={0} role="region" aria-label={t.daily}>
          <table><thead><tr><th rowSpan={2}>{t.date}</th>{Array.from({ length: 6 }, (_, index) => <th key={index} colSpan={2}>{index + 1}.</th>)}<th colSpan={3}>{t.total}</th></tr>
            <tr>{Array.from({ length: 6 }, (_, index) => [<th key={`key-${index}`}>{t.key}</th>, <th key={`sec-${index}`}>{t.seconds}</th>])}<th>{t.points}</th><th>{t.totalTime}</th><th>%</th></tr></thead>
            <tbody>{history.days.map((day) => <tr key={day.date}><th scope="row">{dateLabel(day.date, language)}</th>
              {day.results.map((result, index) => [
                <td key={`key-${index}`} className={result ? result.correct ? 'solving-hall__correct' : 'solving-hall__wrong' : ''}
                  title={result ? result.correct ? t.correct : t.wrong : ''}>{result ? result.correct ? '✓' : '✗' : '·'}</td>,
                <td key={`sec-${index}`}>{result ? `${result.reopened ? '*' : ''}${result.seconds}` : '·'}</td>,
              ])}
              <td>{day.points}/6</td><td>{duration(day.totalSeconds)}</td>
              <td>{(day.points * 100 / 6).toFixed(0)}%</td></tr>)}
              {!history.days.length && <tr><td colSpan="16">{t.noHistory}</td></tr>}</tbody>
          </table>
        </div>
      </>}
    </section>}
  </section>;
}

export default SolvingHallOfFame;
