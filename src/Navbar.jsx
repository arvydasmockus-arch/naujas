import "./Navbar.css";

function FlowlyLogo() {
  return (
    <div className="navbar__brand-icon" aria-hidden="true">
      <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" role="img">
        <path
          d="M11 9.5C11 7.57 12.57 6 14.5 6H25.5C27.43 6 29 7.57 29 9.5V13.5C29 15.43 27.43 17 25.5 17H14.5C12.57 17 11 15.43 11 13.5V9.5Z"
          fill="currentColor"
          opacity="0.55"
        />

        <path
          d="M7 18.5C7 16.57 8.57 15 10.5 15H21.5C23.43 15 25 16.57 25 18.5V22.5C25 24.43 23.43 26 21.5 26H10.5C8.57 26 7 24.43 7 22.5V18.5Z"
          fill="currentColor"
          opacity="0.8"
        />

        <path
          d="M15 27.5C15 25.57 16.57 24 18.5 24H29.5C31.43 24 33 25.57 33 27.5V31.5C33 33.43 31.43 35 29.5 35H18.5C16.57 35 15 33.43 15 31.5V27.5Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

function Navbar({ activePage, onNavigate }) {
  const navigationItems = [
    { label: "Pagrindinis", page: "home", disabled: false },
    { label: "Užduotys", page: null, disabled: true },
    { label: "Progresas", page: null, disabled: true },
    { label: "Orai", page: "weather", disabled: false },
    { label: "Profilis", page: "profile", disabled: false },
    { label: "ML mokykla", page: "news", disabled: false },
    { label: "Turnyrai", page: "tournaments", disabled: false },
    { label: "Matplus", page: "matplus", disabled: false },
  ];

  return (
    <header className="navbar">
      <nav className="navbar__container" aria-label="Pagrindinė navigacija">
        <div className="navbar__brand">
          <FlowlyLogo />

          <span className="navbar__brand-name">ML mokykla</span>
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
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
