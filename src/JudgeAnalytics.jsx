import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAnalyticsSummary } from './analyticsApi';
import './JudgeAnalytics.css';

const labels = {
  en: {
    title: 'Site activity', days: 'Period', refresh: 'Refresh', loading: 'Loading statistics…',
    pageViews: 'Page views', averageDaily: 'Average daily visitors', solverDays: '#2 solver-days',
    tournamentStarts: 'Six-problem participants', monthly: 'Monthly summary', month: 'Month', unique: 'Unique visitors',
    avg: 'Avg. visitors/day', sections: 'Sections', section: 'Section', views: 'Views', daysTable: 'Daily activity',
    date: 'Date', visitors: 'Visitors', solvers: '#2 solvers', attempts: '#2 answers', incorrect: 'Incorrect', avgSeconds: 'Avg. seconds', sixTraining: 'Training', sixCompetition: 'Competition',
    privacy: 'Visitor totals are estimates based on a monthly rotating IP and browser identifier. Raw IP addresses are not stored by this app; shared networks can count as one visitor.',
    pages: { news: 'Home', solving: 'Daily #2', training: 'Training & competitions', tournaments: 'WSC' },
  },
  lt: {
    title: 'Svetainės statistika', days: 'Laikotarpis', refresh: 'Atnaujinti', loading: 'Įkeliama statistika…',
    pageViews: 'Puslapių peržiūros', averageDaily: 'Vidutiniškai lankytojų per dieną', solverDays: '#2 sprendėjų dienos',
    tournamentStarts: 'Šešių uždavinių dalyviai', monthly: 'Mėnesio suvestinė', month: 'Mėnuo', unique: 'Unikalūs lankytojai',
    avg: 'Vid. lankytojų per dieną', sections: 'Skiltys', section: 'Skiltis', views: 'Peržiūros', daysTable: 'Dienos aktyvumas',
    date: 'Data', visitors: 'Lankytojai', solvers: '#2 sprendėjai', attempts: '#2 atsakymai', incorrect: 'Klaidingi', avgSeconds: 'Vid. sekundės', sixTraining: 'Treniruotė', sixCompetition: 'Varžybos',
    privacy: 'Lankytojų skaičius apytikslis: naudojamas kas mėnesį keičiamas IP ir naršyklės identifikatorius. Neapdorotų IP adresų ši programa neišsaugo; bendras tinklas gali būti skaičiuojamas kaip vienas lankytojas.',
    pages: { news: 'Pagrindinis', solving: 'Dienos #2', training: 'Treniruotės ir varžybos', tournaments: 'WSC' },
  },
};
const number = (value) => Number(value || 0).toLocaleString();
const dateText = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function JudgeAnalytics({ language = 'en', accessKey }) {
  const t = labels[language];
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const daily = useMemo(() => new Map((data?.daily ?? []).map((row) => [row.day, row])), [data]);
  const solving = useMemo(() => new Map((data?.dailySolving ?? []).map((row) => [row.day, row])), [data]);
  const tournaments = useMemo(() => {
    const grouped = new Map();
    for (const row of data?.dailyTournaments ?? []) {
      const item = grouped.get(row.day) ?? { training: 0, competition: 0 };
      item[row.mode] = Number(row.players || 0); grouped.set(row.day, item);
    }
    return grouped;
  }, [data]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setData(await getAnalyticsSummary(accessKey, period)); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }, [accessKey, period]);
  useEffect(() => {
    let current = true;
    getAnalyticsSummary(accessKey, period).then((result) => { if (current) setData(result); })
      .catch((problem) => { if (current) setError(problem.message); });
    return () => { current = false; };
  }, [accessKey, period]);

  const participantDays = (data?.dailySolving ?? []).reduce((sum, row) => sum + Number(row.players || 0), 0);
  const sixStarts = (data?.dailyTournaments ?? []).reduce((sum, row) => sum + Number(row.players || 0), 0);
  const average = (data?.monthlyDaily ?? []).length
    ? (data.monthlyDaily.reduce((sum, row) => sum + Number(row.averageDailyVisitors || 0), 0) / data.monthlyDaily.length).toFixed(1) : '0';

  return <section className="judge-analytics tournament-panel">
    <div className="judge-analytics__heading"><div><h2>{t.title}</h2><p>{t.privacy}</p></div>
      <label>{t.days}<select value={period} onChange={(event) => setPeriod(Number(event.target.value))}>
        <option value={30}>30 {language === 'lt' ? 'd.' : 'days'}</option><option value={90}>90 {language === 'lt' ? 'd.' : 'days'}</option>
      </select></label><button type="button" disabled={busy} onClick={load}>{t.refresh}</button></div>
    {error && <p className="judge-analytics__error" role="alert">{error}</p>}
    {busy && !data ? <p>{t.loading}</p> : data && <>
      <div className="judge-analytics__cards">
        <article><span>{t.pageViews}</span><strong>{number(data.totals.views)}</strong></article>
        <article><span>{t.averageDaily}</span><strong>{average}</strong></article>
        <article><span>{t.solverDays}</span><strong>{number(participantDays)}</strong></article>
        <article><span>{t.tournamentStarts}</span><strong>{number(sixStarts)}</strong></article>
      </div>
      <div className="judge-analytics__grid">
        <div><h3>{t.monthly}</h3><div className="judge-analytics__scroll"><table><thead><tr><th>{t.month}</th><th>{t.unique}</th><th>{t.avg}</th><th>{t.views}</th></tr></thead>
          <tbody>{data.monthly.map((row) => <tr key={row.month}><td>{row.month}</td><td>{number(row.visitors)}</td>
            <td>{Number(data.monthlyDaily.find((item) => item.month === row.month)?.averageDailyVisitors || 0).toFixed(1)}</td><td>{number(row.views)}</td></tr>)}
            {!data.monthly.length && <tr><td colSpan="4">0</td></tr>}</tbody></table></div></div>
        <div><h3>{t.sections}</h3><div className="judge-analytics__scroll"><table><thead><tr><th>{t.section}</th><th>{t.visitors}</th><th>{t.views}</th></tr></thead>
          <tbody>{data.sections.map((row) => <tr key={row.section}><td>{t.pages[row.section] || row.section}</td><td>{number(row.visitors)}</td><td>{number(row.views)}</td></tr>)}
            {!data.sections.length && <tr><td colSpan="3">0</td></tr>}</tbody></table></div></div>
      </div>
      <h3>{t.daysTable} · {data.days} {language === 'lt' ? 'dienų' : 'days'}</h3>
      <div className="judge-analytics__scroll judge-analytics__daily"><table><thead><tr><th>{t.date}</th><th>{t.visitors}</th><th>{t.views}</th><th>{t.solvers}</th><th>{t.attempts}</th><th>{t.incorrect}</th><th>{t.avgSeconds}</th><th>{t.sixTraining}</th><th>{t.sixCompetition}</th></tr></thead>
        <tbody>{[...daily.values()].map((row) => <tr key={row.day}><td>{dateText(row.day)}</td><td>{number(row.visitors)}</td><td>{number(row.views)}</td>
          <td>{number(solving.get(row.day)?.players)}</td><td>{number(solving.get(row.day)?.answers)}</td><td>{number(solving.get(row.day)?.incorrect)}</td>
          <td>{Number(solving.get(row.day)?.averageSeconds || 0).toFixed(1)}</td><td>{number(tournaments.get(row.day)?.training)}</td><td>{number(tournaments.get(row.day)?.competition)}</td></tr>)}
          {!daily.size && <tr><td colSpan="9">0</td></tr>}</tbody></table></div>
    </>}
  </section>;
}

export default JudgeAnalytics;
