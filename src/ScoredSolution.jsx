import './ScoredSolution.css';
function ScoredSolution({ text }) {
  return <pre className="scored-solution">{text.split(/(\[\d+(?:[.,]\d+)?\])/g).map((part, index) =>
    /^\[\d+(?:[.,]\d+)?\]$/.test(part) ? <strong className="scored-solution__points" key={index}>{part}</strong> : <span key={index}>{part}</span>)}</pre>;
}
export default ScoredSolution;
