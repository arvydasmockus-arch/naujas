import { useState } from "react";
import "./ProgressBar.css";

function ProgressBar({ initialProgress = 50 }) {
  const [progress, setProgress] = useState(initialProgress);

  function handleChange(event) {
    setProgress(Number(event.target.value));
  }

  return (
    <section className="progress-card">
      <div className="progress-card__top">
        <div>
          <h2>Progresas</h2>
          <p>Užduočių atlikimo progresas</p>
        </div>

        <span className="progress-card__percentage">{progress}%</span>
      </div>

      <input
        className="progress-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={progress}
        onChange={handleChange}
        style={{
          "--progress": `${progress}%`,
        }}
        aria-label="Užduočių progresas"
      />
    </section>
  );
}

export default ProgressBar;
