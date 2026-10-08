import "./News.css";

function News() {
  return (
    <main className="news-page" aria-label="Delfi naujienos">
      <iframe
        className="news-page__frame"
        src="https://www.delfi.lt/"
        title="Delfi naujienų portalas"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="fullscreen"
      />
      <p className="news-page__help">
        Jei portalas neatsidaro, <a href="https://www.delfi.lt/" target="_blank" rel="noopener noreferrer">atidarykite Delfi atskirai</a>.
      </p>
    </main>
  );
}

export default News;
