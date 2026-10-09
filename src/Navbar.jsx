import "./Navbar.css";
import academyLogo from "./assets/ml-academy-logo.jpg";

function Navbar({ activePage, onNavigate, language = 'lt' }) {
  const english = language === 'en';
  const navigationItems = [
    { label: "Pagrindinis", page: "home", disabled: false },
    { label: "Užduotys", page: null, disabled: true },
    { label: "Progresas", page: null, disabled: true },
    { label: "Orai", page: "weather", disabled: false },
    { label: "Profilis", page: "profile", disabled: false },
    { label: "ML mokykla", page: "news", disabled: false },
    { label: "Pasaulio taurės turnyrai", page: "tournaments", disabled: false },
    { label: "Spręsti", page: "solving", disabled: false },
    { label: "Treniruotės ir varžybos", page: "training", disabled: false },
  ];

  return (
    <header className={`navbar${['solving', 'training'].includes(activePage) ? ' navbar--solving' : ''}`}>
      <nav className="navbar__container" aria-label={english ? 'Main navigation' : 'Pagrindinė navigacija'}>
        <div className="navbar__brand">
          <img className="navbar__brand-logo" src={academyLogo} alt={english ? "Martynas Limontas academy logo" : "Martyno Limonto mokyklos logotipas"} />

          <span className="navbar__brand-name">{english ? 'ML Academy' : 'ML mokykla'}</span>
        </div>

        <div className="navbar__links">
          {navigationItems.map((item) => (
            <button
              className={`navbar__link${
                activePage === item.page ? " navbar__link--active" : ""
              }`}
              type="button"
              disabled={item.disabled}
              aria-disabled={item.disabled}
              aria-current={activePage === item.page ? "page" : undefined}
              key={item.label}
              onClick={item.disabled ? undefined : () => onNavigate?.(item.page)}
            >
              {english ? ({ home: 'Home', weather: 'Weather', profile: 'Profile', news: 'ML Academy', tournaments: 'WSC', solving: 'Solve', training: 'Training & competitions' }[item.page] || ({ 'Užduotys': 'Tasks', 'Progresas': 'Progress' }[item.label])) : item.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
