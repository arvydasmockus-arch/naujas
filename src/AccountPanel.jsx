import { useEffect, useId, useRef, useState } from 'react';
import { accountRequest, saveAccountSession } from './accountApi';
import { accountErrorText, accountTranslations } from './accountTranslations';
import './AccountPanel.css';

function AccountPanel({ user, onChange, registrationReady, language = 'lt' }) {
  const t = accountTranslations[language] || accountTranslations.lt;
  const [mode, setMode] = useState('login');
  const [open, setOpen] = useState(false);
  const [challengeId, setChallengeId] = useState(() => {
    try { return sessionStorage.getItem('ml-registration-challenge') || ''; } catch { return ''; }
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const titleId = useId();
  const passwordHintId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function chooseMode(nextMode) {
    setMode(nextMode); setError(''); setMessage(''); setOpen(true);
  }
  async function perform(action, data) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await accountRequest(action, data);
      if (result.token) {
        saveAccountSession(result.token); sessionStorage.removeItem('ml-registration-challenge');
        setChallengeId(''); onChange(result.user); setOpen(false); setMode('login');
      } else if (result.challengeId) {
        setChallengeId(result.challengeId); sessionStorage.setItem('ml-registration-challenge', result.challengeId);
        setMode('verify'); setMessage(result.needsVerification ? 'verifyFirst' : 'codeSent');
      } else if (action === 'logout') {
        saveAccountSession(null); onChange(null); setMode('login');
      }
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    perform(mode, mode === 'verify' ? { challengeId, code: data.code } : data);
  }
  return <div className="account-controls">
    {user ? <><span className="account-controls__username" title={`${t.signedIn}: ${user.username}`}>{user.username}</span>
      <button type="button" className="account-controls__button" disabled={busy} onClick={() => perform('logout', {})}>{t.logout}</button></>
      : <><button type="button" className="account-controls__button" aria-haspopup="dialog" onClick={() => chooseMode('login')}>{t.login}</button>
        <button type="button" className="account-controls__button account-controls__button--primary" aria-haspopup="dialog" onClick={() => chooseMode('register')}>{t.register}</button></>}
    {error && !open && <span className="account-controls__error" role="alert">{accountErrorText(error, language)}</span>}
    <dialog className="account-panel" ref={dialogRef} aria-labelledby={titleId} lang={language} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <div className="account-panel__heading"><h2 id={titleId}>{mode === 'login' ? t.login : mode === 'register' ? t.register : t.verify}</h2>
        <button type="button" className="account-panel__close" onClick={() => setOpen(false)} aria-label={t.close}>×</button></div>
      {!user && <>
        <div className="account-panel__tabs">
          <button type="button" disabled={busy} aria-pressed={mode === 'login'} onClick={() => chooseMode('login')}>{t.login}</button>
          <button type="button" disabled={busy} aria-pressed={mode === 'register'} onClick={() => chooseMode('register')}>{t.register}</button>
          {challengeId && <button type="button" disabled={busy} aria-pressed={mode === 'verify'} onClick={() => chooseMode('verify')}>{t.verify}</button>}
        </div>
        {error && <p role="alert">{accountErrorText(error, language)}</p>}
        {mode === 'register' && !registrationReady ? <p>{t.registrationPending}</p> : <form onSubmit={submit} key={mode}>
          {mode === 'register' && <><label>{t.username}<input name="username" autoComplete="username" minLength={2} maxLength={40} required /></label>
            <label>{t.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label></>}
          {mode === 'login' && <label>{t.loginName}<input name="login" autoComplete="username" maxLength={254} required /></label>}
          {mode !== 'verify' ? <label>{t.password}<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={4} maxLength={128} aria-describedby={passwordHintId} required /><small id={passwordHintId}>{t.passwordHint}</small></label>
            : <label>{t.code}<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>}
          <button disabled={busy}>{busy ? t.wait : mode === 'login' ? t.login : mode === 'register' ? t.getCode : t.confirm}</button>
        </form>}
        {mode === 'verify' && <><p>{t.codeHint}</p><button type="button" disabled={busy} onClick={() => perform('resend', { challengeId })}>{t.resend}</button></>}
        {message && <p role="status">{t[message]}</p>}
      </>}
    </dialog>
  </div>;
}
export default AccountPanel;
