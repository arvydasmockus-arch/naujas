import { tournamentTranslations } from './tournamentTranslations';
import './TournamentResults.css';

function TournamentResults({ event, language, judge = false, onEdit, onDelete }) {
  const t = tournamentTranslations[language];
  return <section className="tournament-results">
    <h2>{t.results}</h2><p>{t.resultHint}</p>
    <div className="tournament-results__scroll" tabIndex={0} role="region" aria-label={t.results}>
      <table><thead><tr>
        <th rowSpan={2}>{t.rank}</th><th rowSpan={2}>{t.solver}</th><th rowSpan={2}>{t.category}</th>
        <th rowSpan={2}>{t.country}</th><th rowSpan={2}>{t.rating}</th><th rowSpan={2}>{t.titleShort}</th>
        <th colSpan={6}>120 min</th><th rowSpan={2}>{t.total}</th><th rowSpan={2}>{t.minutes}</th>{judge && <th rowSpan={2} />}
      </tr><tr>{event.puzzles.map((puzzle, index) => <th key={index}>{index + 1}.<br />{puzzle.stipulation}</th>)}</tr></thead>
        <tbody>{event.results.map((row) => <tr key={row.id}><td>{row.rank}</td><th scope="row">{row.name}</th>
          <td>{row.category}</td><td>{row.country}</td><td>{row.rating}</td><td>{row.title}</td>
          {row.scores.map((score, index) => <td key={index}>{score ?? '—'}</td>)}<td><strong>{row.total}</strong></td><td>{row.minutes}</td>
          {judge && <td><button type="button" onClick={() => onEdit(row)}>{t.edit}</button><button type="button" onClick={() => onDelete(row.id)}>{t.remove}</button></td>}
        </tr>)}{!event.results.length && <tr><td colSpan={judge ? 15 : 14}>{t.noResults}</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
export default TournamentResults;
