import ChessBoard from './ChessBoard';
import { solvingTranslations } from './solvingTranslations';
import './ProblemReview.css';

function average(value) { return value === null ? '—' : value.toFixed(1); }

function ProblemReview({ puzzles, statistics, language }) {
  const t = solvingTranslations[language];
  return (
    <section className="problem-reviews" aria-label={t.statistics}>
      <header><h2>{t.statistics}</h2><p>{t.allAverageHint}</p></header>
      {puzzles.map((puzzle, index) => {
        const stat = statistics[index] ?? { solved: 0, failed: 0, skipped: 0, answered: 0, averageSeconds: null, averageCorrectSeconds: null, wrongMoves: [] };
        return <article className="problem-review" key={puzzle.id}>
          <div className="problem-review__diagram"><span className="problem-review__number">{index + 1}. · #2</span>
            <ChessBoard fen={puzzle.fen} compact disabled language={language} onMove={() => {}} /></div>
          <div className="problem-review__details">
            <h3>{puzzle.authors.join(' · ') || '—'}</h3>
            <p className="problem-review__source">{puzzle.source} {puzzle.year} · <a href={puzzle.sourceUrl} target="_blank" rel="noopener noreferrer">YACPDB #{puzzle.id}</a></p>
            <p className="problem-review__key">1. {puzzle.keySan}!</p>
            <div className="problem-review__stats">
              <span><strong>{stat.solved}</strong> {t.solved}</span><span><strong>{stat.failed}</strong> {t.failed}</span>
              <span><strong>{average(stat.averageSeconds)}</strong> {t.seconds} · {t.average}</span>
              <span><strong>{average(stat.averageCorrectSeconds)}</strong> {t.seconds} · {t.averageCorrect}</span>
              {stat.skipped > 0 && <span>{t.skipped}: {stat.skipped}</span>}
            </div>
            <h4>{t.claimedMoves}</h4>
            <table className="problem-review__claims"><thead><tr><th>{t.claimed}</th><th>{t.claims}</th><th>{t.averageSeconds}</th></tr></thead>
              <tbody>
                <tr className="problem-review__claim--correct"><td>{puzzle.keySan}!</td><td>{stat.solved}</td><td>{average(stat.averageCorrectSeconds)}</td></tr>
                {stat.wrongMoves.map((claim) => <tr className="problem-review__claim--wrong" key={claim.san}><td>{claim.san}?</td><td>{claim.count}</td><td>{average(claim.averageSeconds)}</td></tr>)}
                {stat.skipped > 0 && <tr><td>{t.skipped}</td><td>{stat.skipped}</td><td>—</td></tr>}
              </tbody></table>
            <details><summary>{t.solution}</summary><pre>{puzzle.solution}</pre></details>
          </div>
        </article>;
      })}
    </section>
  );
}

export default ProblemReview;
