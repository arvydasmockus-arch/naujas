import { solvingTranslations } from './solvingTranslations';
import './SprintProblemReview.css';

function average(value) { return value == null ? '—' : value.toFixed(1); }

function SprintProblemReview({ puzzle, statistics, language }) {
  if (!puzzle) return null;
  const t = solvingTranslations[language];
  const stat = statistics ?? {};
  return <section className="sprint-review">
    <h3>{puzzle.authors?.join(' · ') || '—'}</h3>
    <p className="sprint-review__source">{puzzle.source} {puzzle.year}
      {' · '}<a href={puzzle.sourceUrl} target="_blank" rel="noopener noreferrer">YACPDB</a></p>
    <p className="sprint-review__key">1. {puzzle.keySan}!</p>
    <div className="sprint-review__stats">
      <span><strong>{stat.solved ?? 0}</strong> {t.solved}</span>
      <span><strong>{stat.failed ?? 0}</strong> {t.failed}</span>
      <span><strong>{average(stat.averageSeconds)}</strong> {t.seconds} · {t.average}</span>
      <span><strong>{average(stat.averageCorrectSeconds)}</strong> {t.seconds} · {t.averageCorrect}</span>
      {stat.skipped > 0 && <span>{t.skipped}: {stat.skipped}</span>}
    </div>
    <h4>{t.claimedMoves}</h4>
    <div className="sprint-review__table-wrap"><table>
      <thead><tr><th>{t.move}</th><th>{t.count}</th><th>{t.solver}</th><th>{t.averageSeconds}</th></tr></thead>
      <tbody>{(stat.moves ?? []).map((claim) => <tr key={`${claim.correct}:${claim.move}`}>
        <td className={claim.correct ? 'sprint-review__correct' : claim.move ? 'sprint-review__wrong' : ''}>
          {claim.move ? `${claim.move}${claim.correct ? '!' : '?'}` : t.skipped}</td>
        <td>{claim.count}</td>
        <td>{claim.players.map((player) => player.name).join(', ')}</td>
        <td>{average(claim.averageSeconds)}</td>
      </tr>)}</tbody>
    </table></div>
    <details className="sprint-review__solution"><summary>{t.solution}</summary><pre>{puzzle.solution}</pre></details>
  </section>;
}

export default SprintProblemReview;
