import { useCallback, useEffect, useState } from 'react';
import { accountRequest } from './accountApi';
import './JudgeAccounts.css';
import { interfaceText, languageLocale, localizedError } from './russianTranslations.js';

function JudgeAccounts({ accessKey, language = 'lt' }) {
  const text = (lt, en) => interfaceText(language, lt, en);
  const time = (value) => value ? new Date(value).toLocaleString(languageLocale(language), { timeZone: 'Europe/Vilnius' }) : '—';
  const sections = { news: text('Pagrindinis', 'Home'), solving: 'Matplus', sprint: '3 × #2', training: text('Atviri turnyrai', 'Open Tournaments'), tournaments: 'WSC' };
  const actions = { page_view: text('Atidarė puslapį', 'Opened page'), start: text('Pradėjo spręsti', 'Started solving'), submit: text('Pateikė atsakymus', 'Submitted answers'), answer: text('Pateikė ėjimą', 'Submitted move') };
  const [now] = useState(Date.now);
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function verifyUser(user) {
    const warning = language === 'ru'
      ? `Подтвердить почту пользователя «${user.username}» (${user.email}) вручную? Он сможет войти с паролем без кода из письма. Подтверждайте только знакомого человека и проверенный адрес.`
      : text(`Patvirtinti vartotojo „${user.username}“ paštą (${user.email}) rankiniu būdu? Jis galės prisijungti su slaptažodžiu be laiško kodo. Patvirtinkite tik pažįstamą žmogų ir patikrintą adresą.`,
        `Manually approve the email for “${user.username}” (${user.email})? They will be able to log in with their password without an email code. Only approve someone you know and an address you have checked.`);
    if (busy || user.verified_at || !window.confirm(warning)) return;
    setBusy(true); setError(''); setStatus('');
    try {
      await accountRequest('judge/verify', { id: user.id, username: user.username, email: user.email, confirmed: true }, accessKey);
      setData(await accountRequest(`judge/users?page=${page}`, undefined, accessKey));
      setStatus(text('Vartotojas patvirtintas. Jis gali prisijungti savo vardu ir slaptažodžiu.', 'User approved. They can log in with their username and password.'));
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function deleteUser(user) {
    const warning = language === 'ru'
      ? `Удалить пользователя «${user.username}» (${user.email})? Учётная запись и история входов будут удалены, активные сеансы закрыты. Результаты игр сохранятся. Это действие нельзя отменить.`
      : text(`Ištrinti vartotoją „${user.username}“ (${user.email})? Paskyra ir prisijungimų istorija bus pašalintos, aktyvūs prisijungimai nutraukti. Žaidimo rezultatai liks. Veiksmo atšaukti negalima.`,
        `Delete user “${user.username}” (${user.email})? The account and login history will be removed and active logins revoked. Game results will remain. This cannot be undone.`);
    if (busy || !window.confirm(warning)) return;
    setBusy(true); setError(''); setStatus('');
    try {
      await accountRequest('judge/delete', { id: user.id, username: user.username, email: user.email, confirmed: true }, accessKey);
      if (selected?.id === user.id) { setSelected(null); setHistory(null); }
      setStatus(text('Vartotojas ištrintas. Galima registruotis iš naujo teisingu paštu.', 'User deleted. You can register again with the correct email.'));
      if (page > 0 && data?.users.length === 1) { setData(null); setPage(page - 1); }
      else setData(await accountRequest(`judge/users?page=${page}`, undefined, accessKey));
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setData(await accountRequest(`judge/users?page=${page}`, undefined, accessKey)); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }, [accessKey, page]);
  useEffect(() => {
    let current = true;
    accountRequest(`judge/users?page=${page}`, undefined, accessKey).then((result) => { if (current) { setData(result); setError(''); } })
      .catch((problem) => { if (current) setError(problem.message); });
    return () => { current = false; };
  }, [accessKey, page]);
  useEffect(() => {
    if (!selected) return undefined;
    let current = true;
    accountRequest(`judge/history?id=${encodeURIComponent(selected.id)}`, undefined, accessKey).then((result) => { if (current) setHistory(result); })
      .catch((problem) => { if (current) setError(problem.message); });
    return () => { current = false; };
  }, [selected, accessKey]);
  return <section className="judge-accounts tournament-panel">
    <div className="judge-accounts__heading"><h2>{text('Registruoti vartotojai', 'Registered users')}</h2><button type="button" disabled={busy} onClick={load}>{text('Atnaujinti', 'Refresh')}</button></div>
    <p>{text('Laikai Lietuvos laiku. Aktyvumas fiksuojamas atliekant veiksmus; naršyklės uždarymo laikas nežinomas.', 'Times are shown in Lithuanian time. Activity is recorded on actions; browser closing time is unknown.')}</p>
    {error && <p role="alert">{localizedError(error, language)}</p>}
    {status && <p role="status">{status}</p>}
    <div className="judge-accounts__scroll"><table><thead><tr><th>{text('Vartotojo vardas', 'Username')}</th><th>{text('El. paštas', 'Email')}</th><th>{text('Registracija', 'Registration')}</th><th>{text('Paštas', 'Email')}</th><th>{text('Paskutinis prisijungimas', 'Last login')}</th><th>{text('Paskutinis aktyvumas', 'Last activity')}</th><th>{text('Veiksmas', 'Action')}</th></tr></thead>
      <tbody>{data?.users.map((user) => <tr key={user.id}><td><button type="button" onClick={() => { setHistory(null); setSelected(user); }}>{user.username}</button></td><td>{user.email}</td><td>{time(user.created_at)}</td>
        <td title={user.verified_at ? time(user.verified_at) : undefined}>{user.verified_at ? user.verification_method === 'judge' ? text('Patvirtintas teisėjo', 'Approved by judge') : text('Patvirtintas', 'Verified') : text('Nepatvirtintas', 'Unverified')}</td><td>{time(user.last_login_at)}</td><td>{time(user.last_seen_at)}</td><td><div className="judge-accounts__actions">
          {!user.verified_at && <button type="button" disabled={busy} onClick={() => verifyUser(user)}>{text('Patvirtinti paštą', 'Approve email')}</button>}
          <button type="button" className="judge-accounts__delete" disabled={busy} onClick={() => deleteUser(user)}>{text('Ištrinti vartotoją', 'Delete user')}</button></div></td></tr>)}</tbody></table></div>
    {data && !data.users.length && <p>{text('Vartotojų dar nėra.', 'No users yet.')}</p>}
    <div className="judge-accounts__heading"><button type="button" disabled={page === 0 || busy} onClick={() => { setData(null); setPage(page - 1); }}>{text('Ankstesni', 'Previous')}</button><span>{page + 1} {text('puslapis', 'page')}</span>
      <button type="button" disabled={!data?.hasMore || busy} onClick={() => { setData(null); setPage(page + 1); }}>{text('Kiti', 'Next')}</button></div>
    {selected && <div><h3>{selected.username} – {text('prisijungimų istorija', 'Login history')}</h3>
      {history && <><div className="judge-accounts__scroll"><table><thead><tr><th>{text('Prisijungė', 'Logged in')}</th><th>{text('Paskutinis aktyvumas', 'Last activity')}</th><th>{text('Atsijungė', 'Logged out')}</th><th>{text('Stebėta trukmė', 'Observed duration')}</th></tr></thead>
        <tbody>{history.sessions.map((session) => <tr key={session.id}><td>{time(session.login_at)}</td><td>{time(session.last_seen_at)}</td><td>{session.logout_at ? time(session.logout_at) : session.expires_at < now ? text('Sesija pasibaigusi', 'Session expired') : text('Atsijungimas nefiksuotas', 'Logout not recorded')}</td>
          <td>{Math.max(0, Math.round(((session.logout_at || session.last_seen_at) - session.login_at) / 60000))} min.</td></tr>)}</tbody></table></div>
        <h3>{text('Paskutiniai veiksmai', 'Recent actions')}</h3><div className="judge-accounts__scroll"><table><thead><tr><th>{text('Laikas', 'Time')}</th><th>{text('Puslapis', 'Page')}</th><th>{text('Veiksmas', 'Action')}</th></tr></thead>
          <tbody>{history.activity.map((event, index) => <tr key={index}><td>{time(event.occurred_at)}</td><td>{sections[event.section] || event.section}</td><td>{actions[event.action] || event.action}</td></tr>)}</tbody></table></div>
        <p>{text('Rodoma iki 50 paskutinių prisijungimų ir 100 veiksmų.', 'Up to 50 recent logins and 100 actions are shown.')}</p></>}
    </div>}
  </section>;
}
export default JudgeAccounts;
