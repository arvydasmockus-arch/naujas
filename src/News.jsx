import "./News.css";

function News({
  url = "https://vilniuschess.lt/lt/martyno-limonto-stovykla/",
  title = "Martyno Limonto mokykla",
}) {
  return (
    <main className="news-page" aria-label={title}>
      <iframe
        className="news-page__frame"
        src={url}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="fullscreen"
      />
      <p className="news-page__help">
        Jei puslapis neatsidaro, <a href={url} target="_blank" rel="noopener noreferrer">atidarykite puslapį atskirai</a>.
      </p>
    </main>
  );
}

export default News;
