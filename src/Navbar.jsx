import './Navbar.css';
import academyLogo from './assets/ml-academy-logo.jpg';
import { interfaceText } from './russianTranslations.js';

function Navbar({ activePage, onNavigate, language = 'lt', onLanguageChange, accountControls }) {
  const text = (lt, en) => interfaceText(language, lt, en);
  const navigationItems = [
    { label: 'Matplus', page: 'solving' },
    { label: '3 × #2', page: 'sprint' },
    { label: text('Atviri turnyrai', 'Open Tournaments'), page: 'training' },
    { label: language === 'ru' ? 'Форум' : text('Forumas', 'Forum'), page: 'forum' },
  ];

  return (
    <header className={`navbar${activePage === 'solving' ? ' navbar--solving' : ''}`}>
      <nav className="navbar__container" aria-label={text('Pagrindinė navigacija', 'Main navigation')}>
        <div className="navbar__identity" role="group" aria-label={text('Mokykla ir WSC', 'Academy and WSC')}>
          <button className="navbar__brand" type="button" onClick={() => onNavigate?.('news')}
          aria-label={text('ML mokykla – Pagrindinis', 'ML Academy – Home')}
          aria-current={['news', 'home'].includes(activePage) ? 'page' : undefined}>
          <img className="navbar__brand-logo" src={academyLogo} alt="" />
          <span className="navbar__brand-name">{text('ML mokykla', 'ML Academy')}</span>
          </button>
          <button className={`navbar__link navbar__wsc${activePage === 'tournaments' ? ' navbar__link--active' : ''}`}
            type="button" aria-current={activePage === 'tournaments' ? 'page' : undefined} onClick={() => onNavigate?.('tournaments')}>WSC</button>
        </div>
        <div className="navbar__links" role="group" aria-label={text('Sprendimo turnyrai', 'Solving tournaments')}>
          {navigationItems.map((item) => (
            <button className={`navbar__link${activePage === item.page ? ' navbar__link--active' : ''}`}
              type="button" aria-current={activePage === item.page ? 'page' : undefined} key={item.page}
              onClick={() => onNavigate?.(item.page)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="navbar__actions">
          {accountControls}
          <select className="navbar__language" aria-label={text('Kalba', 'Language')} value={language}
            onChange={(event) => onLanguageChange?.(event.target.value)}>
            <option value="lt">LT</option><option value="en">EN</option><option value="ru">RU</option>
          </select>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
