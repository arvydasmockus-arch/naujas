import AccountPanel from './AccountPanel';
import { accountRequest, saveAccountSession } from './accountApi';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import News from './News';
import SolvingPlatform from './SolvingPlatform';
import TournamentPlatform from './TournamentPlatform';
import SprintPlatform from './SprintPlatform';
import Forum from './Forum';
import { trackPageView } from './analyticsApi';
import './App.css';
import { interfaceText } from './russianTranslations.js';
import { accountErrorText } from './accountTranslations';

function App() {
  const [activePage, setActivePage] = useState(() => {
    const page = new URLSearchParams(window.location.search).get('page');
    return ['solving', 'sprint', 'training', 'tournaments', 'forum'].includes(page) ? page : 'sprint';
  });
  const [language, setLanguage] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('ml-solving-preferences-v2'))?.language; return ['lt', 'en', 'ru'].includes(saved) ? saved : 'en'; }
    catch { return 'en'; }
  });

  const [accountConfig, setAccountConfig] = useState(null);
  const [accountUser, setAccountUser] = useState(null);
  const [accountError, setAccountError] = useState('');
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    let current = true;
    async function loadAccount() {
      try {
        const config = await accountRequest('config');
        const result = config.enabled ? await accountRequest('me') : { user: null };
        if (!current) return;
        if (!result.user) saveAccountSession(null);
        setAccountUser(result.user); setAccountConfig(config);
      } catch (problem) { if (current) setAccountError(problem.message); }
    }
    loadAccount();
    return () => { current = false; };
  }, []);
  useEffect(() => { if (accountConfig) trackPageView(activePage); }, [activePage, accountUser?.id, accountConfig]);

  function handleNavigate(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.history.replaceState(null, '', url);
    setActivePage(page);
  }

  function handleLanguageChange(nextLanguage) {
    setLanguage(nextLanguage);
    try {
      const stored = JSON.parse(localStorage.getItem('ml-solving-preferences-v2')) || {};
      localStorage.setItem('ml-solving-preferences-v2', JSON.stringify({ ...stored, language: nextLanguage }));
    } catch { /* Language selection remains available without local storage. */ }
  }

  return (
    <>
      <Navbar activePage={activePage} onNavigate={handleNavigate} language={language} onLanguageChange={handleLanguageChange}
        accountControls={accountConfig?.enabled ? <AccountPanel user={accountUser} onChange={setAccountUser}
          registrationReady={accountConfig.registrationReady} language={language} /> : null} />
      {accountError && <p role="alert">{accountErrorText(accountError, language)}</p>}
      {(activePage === 'home' || activePage === 'news') && <News />}
      {activePage === 'solving' && accountConfig && <SolvingPlatform key={accountUser?.id || 'guest'} language={language} accountUser={accountUser} accountsEnabled={accountConfig.enabled} />}
      {activePage === 'sprint' && accountConfig && <SprintPlatform key={accountUser?.id || 'guest'} language={language} accountUser={accountUser} accountsEnabled={accountConfig.enabled} />}
      {activePage === 'training' && accountConfig && <TournamentPlatform key={accountUser?.id || 'guest'} language={language} accountUser={accountUser} accountsEnabled={accountConfig.enabled} />}
      {activePage === 'forum' && <Forum key={accountUser?.id || 'guest'} language={language} accountUser={accountUser} />}
      {activePage === 'tournaments' && <News url="https://solving.wfcc.ch/wsc/2026-2027/info.html" title={interfaceText(language, 'Pasaulio sprendimo taurės turnyrai', 'World Solving Cup tournaments')} />}
    </>
  );
}

export default App;
