import './Navbar.css';
import academyLogo from './assets/ml-academy-logo.jpg';

function Navbar({ activePage, onNavigate, language = 'lt', onLanguageChange }) {
  const english = language === 'en';
  const navigationItems = [
    { label: english ? 'ML Academy' : 'ML mokykla', page: 'news' },
    { label: 'WSC', page: 'tournaments' },
    { label: english ? 'Solve' : 'Spręsti', page: 'solving' },
    { label: english ? 'Training & competitions' : 'Treniruotės ir varžybos', page: 'training' },
  ];

  return (
    <header className="navbar">
      <nav className="navbar__container" aria-label={english ? 'Main navigation' : 'Pagrindinė navigacija'}>
        <div className="navbar__brand">
          <img className="navbar__brand-logo" src={academyLogo} alt={english ? 'Martynas Limontas academy logo' : 'Martyno Limonto mokyklos logotipas'} />
          <span className="navbar__brand-name">{english ? 'ML Academy' : 'ML mokykla'}</span>
        </div>
        <div className="navbar__links">
          {navigationItems.map((item) => (
            <button className={`navbar__link${activePage === item.page ? ' navbar__link--active' : ''}`}
              type="button" aria-current={activePage === item.page ? 'page' : undefined} key={item.page}
              onClick={() => onNavigate?.(item.page)}>
              {item.label}
            </button>
          ))}
        </div>
        <button className="navbar__language" type="button" aria-label={english ? 'Switch language to Lithuanian' : 'Keisti kalbą į anglų'}
          onClick={() => onLanguageChange?.(english ? 'lt' : 'en')}>
          {english ? 'LT' : 'EN'}
        </button>
      </nav>
    </header>
  );
}

export default Navbar;
