import { solvingTranslations } from './solvingTranslations';
import './SolvingResults.css';

function SolvingResults({ rows = [], playerId, language = 'en' }) {
  const t = solvingTranslations[language];
  return (
    <section className="solving-results" aria-label={t.results}>
      <h2>{t.results}</h2>
      <div className="solving-results__scroll" tabIndex={0} role="region" aria-label={t.results}>
        <table>
          <caption>{t.results}</caption>
          <thead>
            <tr>
              <th rowSpan={2} scope="col">{t.place}</th><th rowSpan={2} scope="col">{t.solver}</th>
              {Array.from({ length: 6 }, (_, index) => <th key={index} colSpan={2} scope="colgroup">{index + 1}.</th>)}
              <th colSpan={3} scope="colgroup">{t.total}</th>
            </tr>
            <tr>
              {Array.from({ length: 6 }, (_, index) => [
                <th key={`key-${index}`} scope="col">{t.key}</th>, <th key={`sec-${index}`} scope="col">{t.seconds}</th>,
              ])}
              <th scope="col">{t.pts}</th><th scope="col">{t.seconds}</th><th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, place) => <tr key={row.id} className={row.id === playerId ? 'solving-results__own' : ''}>
              <td>{place + 1}.</td><th scope="row">{row.name}</th>
              {row.results.map((result, index) => [
                <td key={`key-${index}`} className={result ? result.correct ? 'solving-results__correct' : 'solving-results__wrong' : ''}
                  aria-label={result ? result.correct ? t.correct : t.wrong : '—'}>{result ? result.correct ? '✓' : '✗' : '–'}</td>,
                <td key={`sec-${index}`}>{result ? `${result.reopened ? '*' : ''}${result.seconds}` : '–'}</td>,
              ])}
              <td><strong>{row.points}</strong></td><td>{row.seconds}</td><td>{row.answered === 6 ? `${Math.round(row.points / 6 * 100)}%` : '…'}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={17}>{t.noResults}</td></tr>}
          </tbody>
        </table>
      </div>
      <p>{t.reopened}</p>
    </section>
  );
}

export default SolvingResults;
