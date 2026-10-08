import "./Matplus.css";

function Matplus() {
  return (
    <main className="matplus-page">
      <section className="matplus-panel" aria-labelledby="matplus-title">
        <h1 id="matplus-title">Matplus</h1>
        <p>Matplus saugumo nustatymai neleidžia puslapio rodyti ML mokyklos viduje.</p>
        <a href="https://matplus.net/start.php" target="_blank" rel="noopener noreferrer">
          Atidaryti Matplus naujame skirtuke ↗
        </a>
        <p className="matplus-panel__hint">ML mokykla ir jos meniu liks šiame skirtuke.</p>
      </section>
    </main>
  );
}

export default Matplus;
