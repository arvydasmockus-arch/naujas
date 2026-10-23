import { useEffect, useState } from 'react';
import { forumRequest } from './forumApi';
import { forumTranslations } from './forumTranslations';
import { languageLocale } from './russianTranslations.js';
import './Forum.css';

function Forum({ language = 'lt', accountUser = null, judgeKey = '' }) {
  const t = forumTranslations[language] || forumTranslations.lt;
  const [view, setView] = useState(() => ({ topicId: judgeKey ? '' : new URLSearchParams(location.search).get('topic') || '', after: 0, before: null }));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [listPages, setListPages] = useState([null]);
  const [postPages, setPostPages] = useState([0]);
  const [newTopic, setNewTopic] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState(null);
  const [editedBody, setEditedBody] = useState('');
  const formatTime = value => new Date(value).toLocaleString(languageLocale(language));
  const action = view.topicId ? `topic?${new URLSearchParams({ id: view.topicId, after: view.after })}`
    : `topics${view.before ? '?' + new URLSearchParams(view.before) : ''}`;

  useEffect(() => {
    const controller = new AbortController();
    forumRequest(action, undefined, '', controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [action, view]);

  function navigate(next) {
    setData(null); setError(''); setEditing(null); setView(next);
    if (!judgeKey) {
      const url = new URL(location.href);
      if (next.topicId) url.searchParams.set('topic', next.topicId); else url.searchParams.delete('topic');
      history.replaceState(null, '', url);
    }
  }
  function openTopic(id) { setPostPages([0]); setReply(''); setNewTopic(false); navigate({ topicId: id, after: 0, before: null }); }
  function back() { setListPages([null]); navigate({ topicId: '', after: 0, before: null }); }
  async function perform(task) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  function create(event) {
    event.preventDefault();
    perform(async () => {
      const result = await forumRequest('topics', { title, body });
      setTitle(''); setBody(''); openTopic(result.id);
    });
  }
  function sendReply(event) {
    event.preventDefault();
    perform(async () => {
      const result = await forumRequest('reply', { topicId: view.topicId, body: reply });
      setReply('');
      const after = Math.max(0, Number(result.id || 1) - 1);
      if (after !== view.after) setPostPages(pages => [...pages, after]);
      navigate({ ...view, after });
    });
  }
  function save(event) {
    event.preventDefault();
    perform(async () => { await forumRequest('edit', { id: editing, body: editedBody }); navigate({ ...view }); });
  }
  function removePost(id) {
    if (!window.confirm(t.deletePostConfirm)) return;
    perform(async () => { await forumRequest('delete-post', { id, confirmed: true }, judgeKey); navigate({ ...view }); });
  }
  function removeTopic() {
    if (!window.confirm(t.deleteTopicConfirm)) return;
    perform(async () => { await forumRequest('delete-topic', { topicId: view.topicId, confirmed: true }, judgeKey); back(); });
  }
  function nextPage() {
    if (view.topicId) { setPostPages(pages => [...pages, data.next]); navigate({ ...view, after: data.next }); }
    else { setListPages(pages => [...pages, data.next]); navigate({ ...view, before: data.next }); }
  }
  function previousPage() {
    if (view.topicId) { const pages = postPages.slice(0, -1); setPostPages(pages); navigate({ ...view, after: pages.at(-1) }); }
    else { const pages = listPages.slice(0, -1); setListPages(pages); navigate({ ...view, before: pages.at(-1) }); }
  }

  return <section className={`forum-page${judgeKey ? ' forum-page--embedded' : ''}`} lang={language}>
    <header className="forum-heading"><div><h1>{judgeKey ? t.moderation : t.title}</h1><p>{t.subtitle}</p></div>
      <div className="forum-actions">{view.topicId && <button type="button" disabled={busy} onClick={back}>{t.back}</button>}
        <button type="button" disabled={busy} onClick={() => navigate({ ...view })}>{t.refresh}</button>
        {!view.topicId && accountUser && <button type="button" className="forum-primary" disabled={busy} onClick={() => setNewTopic(!newTopic)}>{newTopic ? t.cancel : t.newTopic}</button>}
      </div>
    </header>
    <p className="forum-note">{t.manual}</p>
    {!accountUser && <p className="forum-login">{t.login}</p>}
    {error && <p className="forum-error" role="alert">{t[error] || t.FORUM_UNAVAILABLE}</p>}
    {!data && !error && <p role="status">{t.loading}</p>}
    {newTopic && !view.topicId && accountUser && <form className="forum-card forum-form" onSubmit={create}>
      <h2>{t.newTopic}</h2><label>{t.topicTitle}<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={140} disabled={busy} /></label>
      <label>{t.message}<textarea value={body} onChange={event => setBody(event.target.value)} required maxLength={10000} rows={6} disabled={busy} /></label>
      <button className="forum-primary" disabled={busy || !title.trim() || !body.trim()}>{t.create}</button>
    </form>}
    {!view.topicId && data?.topics && <div className="forum-topics">
      {!data.topics.length && <p className="forum-card">{t.empty}</p>}
      {data.topics.map(topic => <article className="forum-card forum-topic" key={topic.id}>
        <button type="button" className="forum-topic__title" disabled={busy} onClick={() => openTopic(topic.id)}>{topic.title}</button>
        <div className="forum-meta"><span>{topic.authorName}</span><time dateTime={new Date(topic.updatedAt).toISOString()}>{formatTime(topic.updatedAt)}</time><span>{topic.postCount} {t.posts}</span></div>
      </article>)}
    </div>}
    {view.topicId && data?.topic && <>
      <div className="forum-heading"><h2 className="forum-title">{data.topic.title}</h2>{judgeKey && <button type="button" className="forum-danger" disabled={busy} onClick={removeTopic}>{t.removeTopic}</button>}</div>
      <div className="forum-posts">{data.posts.map(post => <article className="forum-card" key={post.id}>
        <div className="forum-post__heading"><div className="forum-meta"><strong>{post.authorName}</strong><time dateTime={new Date(post.createdAt).toISOString()}>{formatTime(post.createdAt)}</time>{post.editedAt && <span>{t.edited} {formatTime(post.editedAt)}</span>}</div>
          {!post.deletedAt && <div className="forum-actions">
            {accountUser?.id === post.authorId && <button type="button" disabled={busy} onClick={() => { setEditing(post.id); setEditedBody(post.body); }}>{t.edit}</button>}
            {(judgeKey || accountUser?.id === post.authorId) && <button type="button" className="forum-danger" disabled={busy} onClick={() => removePost(post.id)}>{t.remove}</button>}
          </div>}
        </div>
        {editing === post.id ? <form className="forum-form" onSubmit={save}><label>{t.message}<textarea value={editedBody} onChange={event => setEditedBody(event.target.value)} required maxLength={10000} rows={5} disabled={busy} /></label>
          <div className="forum-actions"><button className="forum-primary" disabled={busy || !editedBody.trim()}>{t.save}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>{t.cancel}</button></div></form>
          : <p className={`forum-message${post.deletedAt ? ' forum-message--deleted' : ''}`}>{post.deletedAt ? t.deleted : post.body}</p>}
      </article>)}</div>
    </>}
    {data && <nav className="forum-pagination" aria-label={t.title}>
      <button type="button" disabled={busy || (view.topicId ? postPages.length : listPages.length) <= 1} onClick={previousPage}>{t.previous}</button>
      <span>{view.topicId ? postPages.length : listPages.length}</span><button type="button" disabled={busy || !data.next} onClick={nextPage}>{t.next}</button>
    </nav>}
    {view.topicId && data?.topic && accountUser && <form className="forum-card forum-form" onSubmit={sendReply}>
      <label>{t.reply}<textarea value={reply} onChange={event => setReply(event.target.value)} required maxLength={10000} rows={5} disabled={busy} /></label>
      <button className="forum-primary" disabled={busy || !reply.trim()}>{t.send}</button>
    </form>}
  </section>;
}
export default Forum;
