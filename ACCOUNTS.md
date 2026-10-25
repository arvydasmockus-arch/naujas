# Vartotojų paskyros

Registracija, pašto patvirtinimas šešių skaitmenų kodu, prisijungimas ir teisėjo vartotojų lentelė įgyvendinti kode. Viešame serveryje paskyrų režimas įjungiamas tik paruošus laiškų pristatymą. Kol jis išjungtas, galioja ankstesnis sprendimo režimas be paskyrų.

## Laiškų siuntimas be nuosavo domeno

Galima naudoti „Brevo“: susikurti paskyrą, patvirtinti siuntėjo el. paštą, įjungti transakcinių laiškų siuntimą ir sukurti API raktą. Siuntėjo patvirtinimas ir paskyros leidimai priklauso nuo paslaugos taisyklių. Jei domenas nepatvirtintas, „Brevo“ gali pakeisti siuntimo adresą savo domenu. Laiškų pristatymą reikia išbandyti į kitą pašto dėžutę.

Paslaugos dokumentacija:

- https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email
- https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication
- https://developers.brevo.com/reference/send-transac-email

Alternatyva – „Resend“, naudojant nuosavą patvirtintą siuntėjo domeną. Raktai ir patvirtinimo kodai neturi būti siunčiami pokalbyje ar įrašomi į Git.

## Serverio įjungimas

1. Paleisti esamus testus: `npm run test:solving`, `npm run lint`, `npm run build`.
2. Pritaikyti migraciją `cloudflare/migrations/0011_accounts.sql` per `npm run cloudflare:migrate`.
3. Cloudflare Worker paslaptyse nustatyti `BREVO_API_KEY` ir `EMAIL_FROM` (paprastas patvirtintas siuntėjo pašto adresas). Vietoje Brevo galima nustatyti `RESEND_API_KEY` ir `EMAIL_FROM`.
4. Nustatyti atskirą atsitiktinę, bent 32 simbolių `AUTH_SECRET` paslaptį. Jos keitimas nutrauks slaptažodžių ir kodų tikrinimą, todėl ją būtina saugiai išlaikyti. Raktų nereikia ir negalima dėti į `VITE_` kintamuosius.
5. Worker kintamajam `ACCOUNTS_ENABLED` nustatyti eilutę `true`. Tai vienu metu įjungia paskyras ir uždraudžia neautentifikuotus sprendimus. Neįjungti, kol laiškų siuntimas neparuoštas.
6. Paskelbti Worker ir svetainę su esamu `VITE_API_BASE_URL`, patikrinti registraciją su realiai pristatytu laišku.

Vietinis `npm run dev` automatiškai sukuria lenteles ir leidžia peržiūrėti paskyrų formas. Laiškams naudojami tie patys aplinkos kintamieji; be siuntimo paslaugos registracija grąžina aiškų pranešimą ir nekuria aktyvios paskyros. Lokalų paskyrų režimą galima išjungti `ACCOUNTS_ENABLED=false`.

## Kaip patikrinti

- Registruoti naują vartotojo vardą, paštą ir 4–128 simbolių slaptažodį. Iki kodo patvirtinimo neturi būti prieigos prie sprendimo.
- Patvirtinti laiške gautą kodą. Kodas galioja 10 minučių, veikia tik vieną kartą; po 5 klaidų reikia naujo. Pakartotinai siųsti galima po minutės, ne daugiau kaip 5 kartus per valandą.
- Atsijungti ir prisijungti vartotojo vardu arba paštu ir slaptažodžiu. Naujo kodo nereikia.
- „Matplus“, „3 × #2“ ir „Atviri turnyrai“ automatiškai naudoja paskyros vardą. Svetimo vardo perdavimą ir svetimos sesijos pateikimą atmeta serveris.
- Teisėjo darbo vietoje tikrinti lentelę „Registruoti vartotojai“, pašto būseną, registracijos ir prisijungimo laikus. Paspaudus vardą matoma istorija. Viešuose rezultatuose paštas nerodomas.
- Mygtukas „Ištrinti vartotoją“ po patvirtinimo pašalina paskyrą, jos sesijas ir prisijungimų istoriją. Žaidimo rezultatai lieka su ankstesniu žaidėjo ID; nauja registracija jų nepaveldi. Paštą ir vartotojo vardą galima registruoti iš naujo.
- Mygtukas „Taisyti“ leidžia toje pačioje eilutėje keisti vardą ir paštą. Tikrinamas jų unikalumas ir ar įrašas nepasikeitė nuo atidarymo. Vardo pakeitimas išlaiko paskyros ir žaidėjo ID, slaptažodį bei taškus; atnaujina su ID susietus vardus žaidimo sesijose ir forume. Ranka suvesti atvirų turnyrų rezultatai, neturintys paskyros ID, automatiškai nepervadinami.
- Pakeitus paštą jo patvirtinimas panaikinamas, ankstesnis kodas ir aktyvūs prisijungimai anuliuojami. Naujas laiškas automatiškai nesiunčiamas: vartotojas prisijungimo lange gali paprašyti kodo į naują paštą arba teisėjas gali patvirtinti paskyrą rankiniu būdu. Slaptažodis nesikeičia.
- Prie nepatvirtintų paskyrų yra mygtukas „Patvirtinti paštą“. Teisėjui patvirtinus konkretų vartotojo vardą ir adresą, paskyra pažymima „Patvirtintas teisėjo“ (`verification_method=judge`). Tai nėra pašto dėžutės patikrinimas kodu: naudoti tik pažįstant asmenį ir patikrinus adresą kitu būdu. Senas kodas anuliuojamas, slaptažodis nesikeičia, vartotojas gali prisijungti pats. Kodu patvirtintoms paskyroms saugoma `verification_method=email`; senesni įrašai be žymos laikomi anksčiau patvirtintais paštu.
- Perkrovus skirtuką prisijungimas lieka. Sesija galioja iki 7 dienų; naršyklės sesijos saugykla išvaloma atsijungus. Uždarius skirtuką gali reikėti prisijungti iš naujo.

## Duomenys ir ribos

- Paskyros turi atskirus ID, nepriklausomus nuo vartotojo vardo. Ankstesni vardu įvesti rezultatai automatiškai naujai paskyrai nepriskiriami.
- Slaptažodžiai saugomi kaip PBKDF2-SHA256 rezultatai su individualia druska ir atskira serverio HMAC paslaptimi; Workers WebCrypto naudojama 100 000 iteracijų. Sesijų žetonai ir vienkartiniai kodai D1 saugomi tik kaip maišos reikšmės.
- Prisijungimo, atsijungimo ir veiksmų laikai fiksuojami įvykių metu. Naršyklės uždarymas nežinomas; trukmė iki paskutinio veiksmo yra apytikslė.
- Periodinių užklausų ir foninių vartotojų atnaujinimų nėra. Teisėjo lentelė skaitoma ją atidarius, pakeitus puslapį arba paspaudus „Atnaujinti“. Paskyros būsenai patikrinti naudojamas indeksuotas sesijos žetono indeksas.
- Kol kas nėra slaptažodžio atkūrimo ar el. pašto keitimo. Tai turi būti atskiri procesai su nauju pašto patvirtinimu.
