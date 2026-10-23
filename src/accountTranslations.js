import { russianLabels, russianText } from './russianTranslations.js';
export const accountTranslations = {
  lt: {
    login: 'Prisijungti', register: 'Registruotis', logout: 'Atsijungti', signedIn: 'Prisijungęs', close: 'Uždaryti', verify: 'Patvirtinti paštą',
    username: 'Vartotojo vardas', email: 'El. paštas', loginName: 'Vartotojo vardas arba el. paštas',
    password: 'Slaptažodis', passwordHint: '4–128 simbolių.', code: 'Vienkartinis kodas',
    wait: 'Palaukite…', getCode: 'Gauti registracijos kodą', confirm: 'Patvirtinti', resend: 'Siųsti naują kodą',
    registrationPending: 'Registracija dar ruošiama. Laukiame laiškų siuntimo įjungimo.',
    codeHint: 'Kodas galioja 10 minučių. Kitą kartą prisijungsite vartotojo vardu ir slaptažodžiu.',
    codeSent: 'Kodas išsiųstas į el. paštą.', verifyFirst: 'Patvirtinkite el. paštą. Jei kodas nebegalioja, paprašykite naujo.',
    unavailable: 'Paskyrų serveris nepasiekiamas. Bandykite vėliau.',
  },
  en: {
    login: 'Log in', register: 'Register', logout: 'Log out', signedIn: 'Signed in as', close: 'Close', verify: 'Verify email',
    username: 'Username', email: 'Email', loginName: 'Username or email',
    password: 'Password', passwordHint: '4–128 characters.', code: 'One-time code',
    wait: 'Please wait…', getCode: 'Send registration code', confirm: 'Verify', resend: 'Send a new code',
    registrationPending: 'Registration is being prepared. Email delivery is not enabled yet.',
    codeHint: 'The code expires in 10 minutes. Next time, log in with your username and password.',
    codeSent: 'A code has been sent to your email.', verifyFirst: 'Verify your email. Request a new code if the previous one has expired.',
    unavailable: 'The account server is unavailable. Please try again later.',
  },
};

accountTranslations.ru = russianLabels(accountTranslations.en);

const englishErrors = {
  'Registracija dar neparuošta.': 'Registration is not ready yet.',
  'Slaptažodis turi būti 4–128 simbolių.': 'Your password must contain 4–128 characters.',
  'Per daug bandymų. Bandykite vėliau.': 'Too many attempts. Please try again later.',
  'Nepavyko issiusti kodo.': 'Could not send the code. Please try again later.',
  'Nepavyko išsiųsti kodo. Bandykite vėliau.': 'Could not send the code. Please try again later.',
  'Laiškų siuntimas dar neparuoštas.': 'Email delivery is not ready yet.',
  'Naują kodą galėsite gauti po minutės.': 'Please wait a minute before requesting a new code.',
  'Reikalinga teisėjo prieiga.': 'Judge access is required.',
  'Paskyros dar neįjungtos.': 'User accounts are not enabled yet.',
  'Per didelė užklausa.': 'The request is too large.', 'Netinkama užklausa.': 'Invalid request.',
  'Vartotojo vardas turi būti 2–40 simbolių: raidės, skaičiai, tarpai, taškai, _ arba -.': 'Your username must contain 2–40 characters: letters, numbers, spaces, periods, _ or -.',
  'Įveskite tinkamą el. paštą.': 'Enter a valid email address.',
  'Šis vartotojo vardas arba el. paštas jau užregistruotas.': 'This username or email is already registered.',
  'Registracija nerasta.': 'Registration was not found.', 'Įveskite šešių skaitmenų kodą.': 'Enter the six-digit code.',
  'Kodas nebegalioja. Paprašykite naujo.': 'The code has expired. Please request a new one.',
  'Neteisingas kodas.': 'Incorrect code.', 'Kodas nebegalioja.': 'The code is no longer valid.',
  'Neteisingas prisijungimo vardas arba slaptažodis.': 'Incorrect username or password.',
  'Nepavyko atlikti veiksmo.': 'Unable to complete the request. Please try again.',
};

export function accountErrorText(message, language) {
  const t = accountTranslations[language] || accountTranslations.lt;
  if (!message || /Failed to fetch|NetworkError|Load failed/.test(message)) return t.unavailable;
  if (language === 'ru') return russianText(englishErrors[message] || (message === t.codeSent ? message : t.unavailable));
  if (language !== 'en') return message;
  return englishErrors[message] || t.unavailable;
}
