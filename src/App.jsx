import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import News from './News';
import SolvingPlatform from './SolvingPlatform';
import TournamentPlatform from './TournamentPlatform';
import { trackPageView } from './analyticsApi';
import './App.css';

function App() {
  const [activePage, setActivePage] = useState(() => {
    const page = new URLSearchParams(window.location.search).get('page');
    return ['solving', 'training', 'tournaments'].includes(page) ? page : 'solving';
  });
  const [language, setLanguage] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ml-solving-preferences-v2'))?.language === 'lt' ? 'lt' : 'en'; }
    catch { return 'en'; }
  });

  useEffect(() => { trackPageView(activePage); }, [activePage]);

  function handleLanguageChange(nextLanguage) {
    setLanguage(nextLanguage);
    try {
      const stored = JSON.parse(localStorage.getItem('ml-solving-preferences-v2')) || {};
      localStorage.setItem('ml-solving-preferences-v2', JSON.stringify({ ...stored, language: nextLanguage }));
    } catch { /* Language selection remains available without local storage. */ }
  }

  return (
    <>
      <Navbar activePage={activePage} onNavigate={setActivePage} language={language} onLanguageChange={handleLanguageChange} />
      {(activePage === 'home' || activePage === 'news') && <News />}
      {activePage === 'solving' && <SolvingPlatform language={language} />}
      {activePage === 'training' && <TournamentPlatform language={language} />}
      {activePage === 'tournaments' && <News url="https://solving.wfcc.ch/wsc/2026-2027/info.html" title={language === 'lt' ? 'Pasaulio sprendimo taurės turnyrai' : 'World Solving Cup tournaments'} />}
    </>
  );
}

export default App;
