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
    </main>
  );
}

export default News;
