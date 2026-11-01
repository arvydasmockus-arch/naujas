import { useEffect, useState } from 'react';
import { tournamentRequest } from './tournamentApi';
import { iscTranslations } from './iscTranslations';
import { localizedError } from './russianTranslations';
import './IscEvent.css';

const locale = (language) => ({ lt: 'lt-LT', en: 'en-GB', ru: 'ru-RU' }[language]);
function iscDate(timestamp, language, timeZone = 'Europe/Berlin') {
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(timestamp);
}

export function IscEvent({ event, language, accessKey, accountUser, now, onChanged, onArm, onRegistrationChanged }) {
  const t = iscTranslations[language]; const judge = Boolean(accessKey);
  const [details, setDetails] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const before = now < event.isc.startsAt;
  useEffect(() => {
    const controller = new AbortController();
    tournamentRequest('isc/details', { key: accessKey, signal: controller.signal, params: { id: event.id } })
      .then((data) => { if (!controller.signal.aborted) { setDetails(data); onRegistrationChanged(data.registered); } }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [event.id, event.isc.armed, event.isc.announced, event.puzzles.length, accountUser?.id, accessKey, onRegistrationChanged]);
  async function refresh() {
    const data = await tournamentRequest('isc/details', { key: accessKey, params: { id: event.id } });
    setDetails(data); onRegistrationChanged(data.registered);
  }
  async function action(actionName, data = {}) {
    setBusy(true); setError('');
    try {
      await tournamentRequest(`isc/${actionName}`, { key: accessKey, data: { id: event.id, ...data } });
      await refresh(); await onChanged();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  const kinds = { generate: t.generateKind, problems: t.problems, solutions: t.solutionsKind };
  return <section className="tournament-panel isc-event">
    <dl className="isc-timetable">{[[t.starts, event.isc.startsAt], [t.ends, event.isc.endsAt], [t.solutions, event.isc.solutionsAt]].map(([label, time]) => <div key={label}><dt>{label}</dt><dd>{iscDate(time, language)} <small>CET / CEST</small></dd></div>)}</dl>
    <p>{t.local}: {iscDate(event.isc.startsAt, language, null)}</p>
    {!judge && !event.isc.problemsAvailable && <p>{t.waiting}</p>}
    {!before && now >= event.isc.endsAt && <p>{t.finished}</p>}
    {error && <p className="tournament-page__error" role="alert">{localizedError(error, language)}</p>}
    {judge && <div className="isc-management">
      <p>{event.isc.armed ? t.armed : t.notArmed}</p>
      {details?.emailReady === false && <p className="tournament-page__error">{t.emailMissing}</p>}
      {event.isc.generateAt && <p>{t.generationAt}: {iscDate(event.isc.generateAt, language, null)}</p>}
      {before && <div className="tournament-downloads">
        <button disabled={busy || event.isc.armed} onClick={() => action('announce', { announced: !event.isc.announced })}>{event.isc.announced ? t.hide : t.announce}</button>
        {!event.puzzles.length && <button disabled={busy} onClick={() => action('generate')}>{t.generate}</button>}
        {event.isc.armed ? <button disabled={busy} onClick={() => action('disarm')}>{t.disarm}</button> :
          <button disabled={busy || event.puzzles.length !== 6 || !event.isc.announced || details?.emailReady === false} onClick={onArm}>{t.arm}</button>}
      </div>}
      <div className="isc-status"><h3>{t.jobs}</h3>{details?.jobs?.map((job) => <p key={job.kind}>{kinds[job.kind]} · {t[job.status] || job.status} · {iscDate(job.runAt, language, null)}{job.error && <span role="alert">{localizedError(job.error, language)}</span>}</p>)}
        <h3>{t.mail}</h3>{details?.mail?.map((row) => <p key={`${row.kind}-${row.status}`}>{kinds[row.kind]} · {t[row.status] || row.status}: {row.count}{row.error && <span role="alert">{localizedError(row.error, language)}</span>}</p>)}
        {(details?.jobs?.some((job) => job.status === 'failed') || details?.mail?.some((mail) => mail.status === 'failed')) && <button disabled={busy} onClick={() => { if (window.confirm(t.retryConfirm)) action('retry', { confirmed: true }); }}>{t.retry}</button>}
      </div>
    </div>}
    <div className="isc-participants"><h3>{t.participants} ({details?.participants?.length ?? 0})</h3>
      {details?.participants?.length ? <ol>{details.participants.map((person) => <li key={person.username}>{person.username}</li>)}</ol> : <p>{t.nobody}</p>}
      {!judge && (before ? accountUser ? <><p>{details?.registered ? t.registered : t.consent}</p><button disabled={busy || !event.isc.announced || !details} onClick={() => action(details?.registered ? 'unregister' : 'register')}>{details?.registered ? t.unregister : t.register}</button></> : <p>{t.login}</p> : <p>{t.closed}</p>)}
      <button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await refresh(); await onChanged(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }}>{t.refresh}</button>
    </div>
  </section>;
}
