# Flowly -- projekto kontekstas

> Šis failas skirtas perduoti projekto kontekstą kitai ChatGPT sesijai.
> Perskaičius šį failą turėtų būti aišku, kokia projekto struktūra,
> technologijos, dabartinis UI ir kokie pakeitimai jau atlikti.

## 1. Projekto apžvalga

Tai nedidelis **React + Vite** projektas, kuriame kuriamas tamsios temos
užduočių / progreso valdymo puslapis.

Dabartiniame puslapyje yra:

-   prisijungimo forma;
-   užduočių sąrašas;
-   progreso juosta;
-   viršutinė navigacijos juosta;
-   responsive mobilus navigacijos vaizdas.

Pagrindinė dizaino kryptis:

-   tamsus fonas;
-   tamsios kortelės su subtiliais borderiais;
-   šviesus tekstas;
-   pilkesnis antrinis tekstas;
-   violetinis pagrindinis akcentas;
-   apvalinti kampai;
-   minimalistinis modernus UI.

## 2. Technologijos ir konvencijos

Projektas naudoja:

-   React;
-   Vite;
-   JavaScript;
-   JSX (`.jsx`);
-   paprastus atskirus CSS failus (`.css`);
-   React `useState`.

Komponentai šiuo metu nėra rašomi su TypeScript, Tailwind ar CSS
Modules.

Naujus komponentus pageidautina kurti pagal esamą struktūrą:

-   `ComponentName.jsx`
-   `ComponentName.css`

ir laikyti tiesiai `src/` kataloge, nebent projekto struktūra ateityje
būtų reorganizuota.

## 3. Dabartinė projekto struktūra

``` text
node_modules/
public/
src/
├── assets/
├── alert.jsx
├── App.css
├── App.jsx
├── index.css
├── main.jsx
├── Navbar.css
├── Navbar.jsx
├── ProgressBar.css
├── ProgressBar.jsx
├── TaskList.css
└── TaskList.jsx

.gitignore
eslint.config.js
index.html
login.js
package-lock.json
package.json
README.md
vite.config.js
```

`Navbar.jsx` ir `Navbar.css` buvo pridėti vėliau kaip naujas navigacijos
komponentas.

## 4. Dabartinis `App.jsx`

``` jsx
import { useState } from "react";
import TaskList from "./TaskList";
import Alert from "./alert";
import ProgressBar from "./ProgressBar";
import Navbar from "./Navbar";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
  }

  const tasks = [
    {
      id: 1,
      title: "Sukurti prisijungimo formą",
      status: "Atlikta",
      deadline: "2026-10-01",
    },
    {
      id: 2,
      title: "Sukurti užduočių sąrašą",
      status: "Vykdoma",
      deadline: "2026-10-05",
    },
  ];

  return (
    <>
      <Navbar />

      <main className="login-page">
        <div className="login-card">
          <header className="login-card__header">
            <h1>Prisijungti</h1>
            <p>Įveskite savo duomenis, kad tęstumėte</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>El. paštas</span>

              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="vardas@pavyzdys.lt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="login-field">
              <span>Slaptažodis</span>

              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <button type="submit" className="login-submit">
              Prisijungti
            </button>

            <Alert message={{ email, password }} />
          </form>
        </div>

        <TaskList tasks={tasks} loading={false} />

        <ProgressBar initialProgress={50} />
      </main>
    </>
  );
}

export default App;
```

Svarbu: `Navbar` yra **už `main.login-page` ribų**, kad navigacija
galėtų užimti visą ekrano plotį.

## 5. Navigacijos komponentas

Buvo sukurtas naujas `Navbar` komponentas.

### `src/Navbar.jsx`

``` jsx
import './Navbar.css'

function FlowlyLogo() {
  return (
    <div className="navbar__brand-icon" aria-hidden="true">
      <svg
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
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
  )
}

function Navbar() {
  const navigationItems = [
    'Pagrindinis',
    'Užduotys',
    'Progresas',
    'Profilis',
  ]

  return (
    <header className="navbar">
      <nav className="navbar__container" aria-label="Pagrindinė navigacija">
        <div className="navbar__brand">
          <FlowlyLogo />

          <span className="navbar__brand-name">
            Flowly
          </span>
        </div>

        <div className="navbar__links">
          {navigationItems.map((item) => (
            <button
              className="navbar__link"
              type="button"
              disabled
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>
    </header>
  )
}

export default Navbar
```

### `src/Navbar.css`

``` css
.navbar {
  width: 100vw;
  margin-left: calc(50% - 50vw);

  background: rgba(20, 20, 28, 0.96);
  border-bottom: 1px solid #292936;

  box-sizing: border-box;
}

.navbar__container {
  width: 100%;
  min-height: 76px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 32px;

  box-sizing: border-box;
}

/* Logo */

.navbar__brand {
  display: flex;
  align-items: center;
  gap: 11px;

  flex-shrink: 0;
}

.navbar__brand-icon {
  width: 38px;
  height: 38px;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #bb7bf6;
}

.navbar__brand-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

.navbar__brand-name {
  color: #f4f2f7;

  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.4px;

  line-height: 1;
}

/* Navigation */

.navbar__links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.navbar__link {
  appearance: none;

  padding: 10px 14px;

  border: 1px solid transparent;
  border-radius: 9px;

  background: transparent;

  color: #8d8c9a;

  font-family: inherit;
  font-size: 14px;
  font-weight: 500;

  white-space: nowrap;

  cursor: default;

  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.navbar__link:disabled {
  opacity: 1;
  color: #777684;
  cursor: default;
}

/* Tablet */

@media (max-width: 768px) {
  .navbar__container {
    min-height: 70px;
    padding: 0 20px;
  }

  .navbar__brand-icon {
    width: 34px;
    height: 34px;
  }

  .navbar__brand-name {
    font-size: 19px;
  }

  .navbar__links {
    gap: 2px;
  }

  .navbar__link {
    padding: 9px 9px;
    font-size: 13px;
  }
}

/* Mobile */

@media (max-width: 580px) {
  .navbar__container {
    min-height: auto;

    flex-direction: column;
    align-items: stretch;

    padding: 15px 16px 12px;
  }

  .navbar__brand {
    margin-bottom: 12px;
  }

  .navbar__links {
    width: 100%;

    display: grid;
    grid-template-columns: repeat(4, 1fr);

    gap: 4px;
  }

  .navbar__link {
    width: 100%;

    padding: 9px 4px;

    font-size: 12px;

    text-align: center;
  }
}

/* Very small phones */

@media (max-width: 390px) {
  .navbar__links {
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
  }

  .navbar__link {
    padding: 8px;
  }
}
```

## 6. Navigacijos sprendimai

Navigacijai buvo pasirinkta:

-   produkto / projekto pavadinimas: **Flowly**;
-   logotipas sukurtas kaip inline SVG React komponente;
-   nereikia papildomo paveikslėlio ar SVG failo;
-   navigacija yra per visą ekrano plotį;
-   navigacija nėra `sticky` ar `fixed`;
-   ji lieka dokumento viršuje ir slenkant dingsta kartu su puslapiu;
-   kairėje rodomas Flowly logotipas ir pavadinimas;
-   dešinėje rodomi punktai:
    -   Pagrindinis
    -   Užduotys
    -   Progresas
    -   Profilis
-   navigacijos punktai šiuo metu yra `disabled` ir neatlieka jokių
    veiksmų;
-   navigacija turi responsive dizainą.

Responsive elgsena:

-   desktop: logo kairėje, navigacijos punktai dešinėje;
-   tablet: sumažinami tarpai, logo ir tekstas;
-   iki 580 px: logo ir navigacija išdėstomi vertikaliai, navigacijos
    punktai tampa keturių stulpelių grid;
-   iki 390 px: navigacijos punktai persirikiuoja į du stulpelius.

## 7. Dabartinio puslapio turinys

Prisijungimo formoje yra:

-   antraštė „Prisijungti";
-   paaiškinimas „Įveskite savo duomenis, kad tęstumėte";
-   el. pašto laukas;
-   slaptažodžio laukas;
-   violetinis mygtukas „Prisijungti";
-   `Alert` komponentas.

Forma naudoja React state:

``` jsx
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
```

`handleSubmit` šiuo metu tik sustabdo standartinį formos submit:

``` jsx
function handleSubmit(event) {
  event.preventDefault();
}
```

Tikro autentifikavimo šiame etape nėra.

## 8. Užduotys

`App.jsx` šiuo metu turi hardcodintą `tasks` masyvą:

``` js
const tasks = [
  {
    id: 1,
    title: "Sukurti prisijungimo formą",
    status: "Atlikta",
    deadline: "2026-10-01",
  },
  {
    id: 2,
    title: "Sukurti užduočių sąrašą",
    status: "Vykdoma",
    deadline: "2026-10-05",
  },
];
```

Jis perduodamas:

``` jsx
<TaskList tasks={tasks} loading={false} />
```

Šiuo metu yra dvi užduotys:

1.  „Sukurti prisijungimo formą" -- `Atlikta`
2.  „Sukurti užduočių sąrašą" -- `Vykdoma`

## 9. Progresas

Progreso komponentas kviečiamas taip:

``` jsx
<ProgressBar initialProgress={50} />
```

Taigi dabartinis pradinis progresas yra **50 %**.

Vizualiai progreso komponentas yra plati tamsi kortelė apatinėje
puslapio dalyje su violetine progreso juosta.

## 10. Dabartinė UI būsena

Desktop vaizde puslapis atrodo maždaug taip:

``` text
┌─────────────────────────────────────────────────────────────┐
│ Flowly                   Pagrindinis Užduotys Progresas ... │
└─────────────────────────────────────────────────────────────┘

              ┌─────────────────┐ ┌─────────────────┐
              │ Prisijungti     │ │ Užduotys        │
              │                 │ │                 │
              │ El. paštas      │ │ Užduotis 1      │
              │ Slaptažodis     │ │ Užduotis 2      │
              │                 │ │                 │
              │ [Prisijungti]   │ │                 │
              └─────────────────┘ └─────────────────┘


┌─────────────────────────────────────────────────────────────┐
│ Progresas                                              50%  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└─────────────────────────────────────────────────────────────┘
```

Navigacija buvo pridėta prie jau egzistavusio puslapio, todėl likusi UI
struktūra neturėjo būti perrašoma.

## 11. Svarbios taisyklės tęsiant darbą

Kitai ChatGPT sesijai:

1.  Laikykis dabartinės tamsios/violetinės dizaino krypties, nebent
    vartotojas paprašys kitaip.
2.  Nauji React komponentai turėtų derėti prie esamų komponentų.
3.  Naudok JSX, ne TypeScript.
4.  CSS šiuo metu laikomas atskiruose `.css` failuose.
5.  Nekonvertuok projekto į Tailwind, CSS Modules ar kitą sistemą be
    aiškaus prašymo.
6.  Jei prašoma pakeisti esamą failą ir pateikiamas jo turinys, grąžink
    **visą atnaujintą failą**, o ne tik kodo fragmentą.
7.  Navigacijos punktai kol kas neturi veikti.
8.  Jei ateityje navigacijos punktai bus aktyvuojami, reikės nuspręsti,
    ar naudoti paprastą state / anchor navigaciją, ar įdiegti routerį.
9.  Neišgalvok neegzistuojančios projekto logikos. Jei reikia keisti
    `TaskList`, `ProgressBar`, `Alert`, `App.css` ar kitą failą,
    pirmiausia paprašyk jo dabartinio turinio, jei jis nebuvo pateiktas.
10. Išlaikyk lietuvišką UI tekstą, kol vartotojas neprašo pakeisti
    kalbos.

## 12. Kas jau padaryta

Iki šio konteksto failo sukūrimo:

-   buvo peržiūrėta projekto struktūra;
-   buvo peržiūrėtas dabartinio puslapio screenshot;
-   nustatyta, kad projektas naudoja React + Vite;
-   sukurtas naujas `Navbar.jsx`;
-   sukurtas naujas `Navbar.css`;
-   sukurtas Flowly pavadinimas;
-   sukurtas inline SVG Flowly logotipas;
-   pridėti neaktyvūs navigacijos punktai;
-   pridėtas responsive navigacijos dizainas;
-   `Navbar` integruotas į `App.jsx`;
-   patvirtinta, kad pakeitimai veikia.

## 13. Tolimesnis kontekstas kitai sesijai

Jei šis failas pateikiamas naujai ChatGPT sesijai, laikyk jį projekto
pradine dokumentacija ir tęsk nuo čia.

Tačiau šis failas nėra automatiškai sinchronizuojamas su projektu. Jei
po jo sukūrimo buvo atlikti nauji pakeitimai, vartotojo pateiktas
naujesnis kodas visada turi prioritetą prieš šiame dokumente esančias
kopijas.

Prieš atliekant didesnius esamų komponentų pakeitimus verta paprašyti
aktualaus konkretaus failo turinio, jei jis nebuvo pateiktas kartu su
užklausa.
