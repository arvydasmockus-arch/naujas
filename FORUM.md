# Viešų diskusijų forumas

- Visos temos ir žinutės viešos. Rašyti gali tik patvirtinta paskyra prisijungęs vartotojas.
- Autoriaus vardą serveris paima iš paskyros. El. pašto adresai ir prisijungimo duomenys viešai negrąžinami.
- Vartotojas gali taisyti arba pašalinti savo žinutę. Pašalinto teksto vietoje lieka žyma, kad nesuirtų diskusija.
- Teisėjo darbo vietoje pasirinkus „Forumas“ galima pašalinti bet kurią žinutę arba visą temą su jos atsakymais. Trynimui būtinas patvirtinimas.
- Ištrynus paskyrą viešos žinutės lieka su ankstesniu autoriaus vardu; nauja paskyra jų taisyti negali.
- Žinutės rodomos kaip paprastas tekstas. HTML ir JavaScript nevykdomi; failų įkėlimo nėra.
- Temos ir žinutės skaitomos po 20, pagal indeksuotą puslapio žymeklį. Bendras įrašų skaičius neskaičiuojamas kiekvieno atidarymo metu. Automatinio periodinio atnaujinimo nėra.
- Viena paskyra gali sukurti iki 5 temų per valandą ir parašyti iki 30 atsakymų per 10 minučių.

## Publikavimas

Pritaikyti `cloudflare/migrations/0013_forum.sql`, paskelbti Worker ir svetainę. Vietiniam serveriui lenteles sukuria `openDatabase`.

## Patikra

`node --test tests/forum.test.mjs`, `npm run lint`, `npm run build`.

Svetainėje atidaryti „Forumas“, prisijungti, sukurti temą, parašyti atsakymą ir išbandyti savo žinutės taisymą. Atsijungus diskusija turi likti matoma, rašymo forma pasislėpti. Teisėjo darbo vietoje patikrinti forumo priežiūros režimą.
