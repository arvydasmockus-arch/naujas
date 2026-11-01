import { useState } from 'react';
import { tournamentRequest } from './tournamentApi';
import { iscTranslations } from './iscTranslations';
import { localizedError } from './russianTranslations';
import './IscCreate.css';

export function IscCreate({ language, accessKey, onCreated }) {
  const t = iscTranslations[language];
  const [title, setTitle] = useState(''); const [date, setDate] = useState('');
  const [scheduled, setScheduled] = useState(false); const [generateAt, setGenerateAt] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function create(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const event = await tournamentRequest('isc/create', { key: accessKey,
        data: { title, date, generateAt: scheduled ? new Date(generateAt).getTime() : null } });
      await onCreated(event.id);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <form className="tournament-panel isc-create" onSubmit={create}>
    <h2>{t.create}</h2><p>{t.createHint}</p>
    <div className="isc-fields"><label>{t.name}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></label>
      <label>{t.date}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label>{t.generation}<select value={scheduled ? 'scheduled' : 'manual'} onChange={(e) => setScheduled(e.target.value === 'scheduled')}><option value="manual">{t.manual}</option><option value="scheduled">{t.scheduled}</option></select></label>
      {scheduled && <label>{t.generationAt}<input type="datetime-local" value={generateAt} onChange={(e) => setGenerateAt(e.target.value)} required /></label>}</div>
    {scheduled && <p>{t.generationHint}</p>}
    {date && <p>11:00–13:00 CET / CEST · {t.solutions}: 14:00 CET / CEST</p>}
    {error && <p className="tournament-page__error" role="alert">{localizedError(error, language)}</p>}
    <button disabled={busy}>{t.create}</button>
  </form>;
}

