# ML Academy internetinis serveris

Paruoštas bendras React puslapio ir Node.js API paleidimas. `npm start` aptarnauja
`dist/` ir serverio API vienu adresu, nenaudodamas Vite kūrimo serverio.
`npm run dev` toliau veikia kompiuteryje kaip anksčiau.

## Render

`render.yaml` aprašo vieną Docker Web Service Frankfurte, 512 MB RAM ir 1 GB
nuolatinį diską. Automatinis diegimas išjungtas, kol atliekamas pirmas perkėlimas.
Paslaugos sukūrimas yra mokamas; prieš kuriant reikia patvirtinti Render rodomą
kainą. 2026-10-09 tikrinta kaina: 7 USD serveris ir 0,25 USD / GB diskas per mėnesį,
be galimų mokesčių. Docker vaizdas vietoje dar nepatikrintas: čia nėra Docker.

1. Prisijungti https://dashboard.render.com per GitHub.
2. Į GitHub perkelti paruoštą kodą. Dabartinis `master` įkėlimas kartu skelbia
   GitHub Pages svetainę, todėl jo neatlikti atsitiktinai prieš pasiruošimą.
3. Render pasirinkti **New → Blueprint**, saugyklą `arvydasmockus-arch/naujas`
   ir šaką su paruoštais failais. Peržiūrėti mokamą serverio ir disko planą.
4. `JUDGE_KEY` įrašyti paskyros slaptoje aplinkos kintamojo reikšmėje. Raktas
   neįrašytas į GitHub ar Docker vaizdą.
5. Sukūrus paslaugą dar būtina perkelti esamą privačią SQLite kopiją į
   `/var/data/solving.sqlite`. Be jos debesyje nebus tavo turnyro, taisytų
   atsakymų ir 61 193 importuotų uždavinių. Šis perkėlimas neatliktas.
6. Perkeliant duomenis serveris turi būti sustabdytas; vien aktyvaus SQLite
   failo perrašyti negalima. Perkėlimą atlikti valdomai, išsaugant pirminę kopiją.
7. Patikrinti `/healthz`, šešias diagramas, prisijungimą, abu PDF puslapius ir
   duomenų išlikimą po serverio perkrovimo. Tik tada dalintis nauju Render adresu.

Render suteiks HTTPS adresą. GitHub Pages adresas šiuo metu su debesies API
nesusietas; visas paruoštas projektas veiks naujame viename Render adrese.
GitHub Pages atnaujinimas savaime neperkelia duomenų bazės.

## Duomenys ir atsarginės kopijos

`DATA_DIR` nusako duomenų katalogą: kompiuteryje `data/`, Render `/var/data`.
Ten saugoma `solving.sqlite`; be `JUDGE_KEY` aplinkos kintamojo ten saugomas ir
`judge-key.txt`. Diskas išlieka per naujus diegimus. Vienas serveris vienam diskui.

`npm run backup:data -- <privatus-kopijos-kelias.sqlite>` sukuria nuoseklią
SQLite kopiją ir veikiant serveriui, įtraukdamas WAL pakeitimus. Duomenų bazė,
atsarginės kopijos ir prieigos raktas nepatenka į Git ar Docker build kontekstą.
Atkūrimas iš kopijos dar neautomatizuotas; prieš perkeliant turi būti baigtas ir
patikrintas konkrečios prieglobos duomenų perkėlimo žingsnis.

Serveris kas minutę tikrina šeštadienio 10:00 Europe/Vilnius rotaciją. Atsakymai
ir rezultatai liks tame pačiame diske. Sustabdytas pilnas importas neatsinaujina.

## Patikra kompiuteryje

`npm run build`, `npm run lint`, `npm run test:solving`, tada `npm start`.
Vienu metu tuo pačiu 5174 prievadu negali veikti `dev` ir `start`.
