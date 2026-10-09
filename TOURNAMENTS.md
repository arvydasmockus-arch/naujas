# ML Academy – treniruotės ir varžybos

Atidaryti: `http://localhost:5174/?page=training`, meniu **Treniruotės ir varžybos**.
Projektas lieka vietinis; į GitHub nepaskelbtas.

## Žaidėjui

Visi šeši uždaviniai pateikiami iš karto: #2, #3, #n (bent 4 ėjimai), etiudas,
s#3–s#5 ir h#3–h#7. H uždavinys gali turėti iki šešių sprendinių. Uždavinių PDF
telpa viename A4 lape: du stulpeliai, trys eilutės, tipas, figūrų ir sprendinių
skaičius. PDF naudojamos nespalvotos diagramos, puslapyje – rudos lentos.

Vardą įrašius ir paspaudus **Pradėti 2 valandų sprendimą**, pradeda veikti
120 minučių laikmatis. Perkrovimas jo nesustabdo. Visi šeši rašytiniai atsakymai
saugomi vienu pateikimu. Pasibaigus laikui naujų atsakymų priimti nebegalima.
Laikas prasideda nuo mygtuko paspaudimo; iki jo galima peržiūrėti diagramas ar
PDF. Tai treniruočių ir pasitikėjimu paremtų varžybų režimas.

Atsakymai išsaugomi teisėjo darbo vietoje ir ruošiamas laiškas adresu
`arvydas.mockus@gmail.com`. Laišką išsiunčia žaidėjas savo pašto programoje.
Programa pati laiško neišsiunčia. Ilgos ėjimų sekos parsisiunčia kaip .txt failas,
kurį žaidėjas prideda prie laiško. Visus atsakymus galima atsisiųsti ir atskirai.

## Teisėjui

Teisėjo darbo vieta atidaroma tame pačiame puslapyje. Prieigos raktas yra
`data/judge-key.txt` serverio kompiuteryje. Jo nereikia duoti žaidėjams. Sprendimų
PDF, juodraščiai, atsakymų peržiūra ir rezultatų keitimas saugomi serverio patikra.

Pasirinkti **Varžybos**, įrašyti pavadinimą ir datą, generuoti rinkinį. Sukuriamas
juodraštis, kuris žaidėjams nerodomas. Teisėjas peržiūri šaltinio sprendimus,
įvertina sunkumą, įrašo taškų skyrimo pastabas (iki 5 taškų už uždavinį) ir gali
pakeisti atskirą juodraščio uždavinį. Prieš paskelbiant varžybas būtina pažymėti,
kad peržiūrėtas sunkumas, sprendimai ir taškų skyrimo planas. Pradėjus žaidėjui
spręsti arba įrašius rezultatus uždavinių pakeisti nebegalima.

Rezultatų forma: vardas, šalis, kategorija, reitingas, titulas, šeši taškai po
0–5 ir bendras laikas 0–120 minučių. Galimi daliniai taškai. Suma (iki 30) ir
vieta skaičiuojamos automatiškai: daugiau taškų, tada mažesnis laikas. Vienodi
taškai ir laikas duoda tą pačią vietą. Oficialus reitingas ir WSC taškai neskaičiuojami.
Teisėjo asmeninės pastabos žaidėjams neperduodamos.

Sprendimus ir rezultatus reikia paskelbti atskirai. Iki paskelbimo žaidėjų API
negrąžina sprendimų, autorių, šaltinio identifikatorių ar teisėjo įvertinimų.
Sprendimų PDF pateikia teisėjo redaguojamą sutrumpintų ėjimų ir taškų juodraštį.
Originalų šaltinio sprendimą galima išskleisti palyginimui. Taškai rašomi žymomis
`[1.25]`, `[2.5]`, `[5]` ir peržiūroje bei PDF rodomi raudonai. Kiekviena žyma
yra atskiro varianto vertė: keturi variantai po 1,25, du po 2,5, iš viso 5 taškai.
Raktui #3 ir #n atskiri taškai nepridedami. Nedalios šimtosios paskirstomos tarp
variantų, kad jų suma būtų tiksliai 5; teisėjas gali pakeisti kiekvieną žymą.
Prieš atsisiunčiant pasirinkto turnyro sprendimų PDF pataisymai išsaugomi automatiškai.

#2 juodraštyje lieka raktas su 5 taškais ir šaltinyje pateikti klaidingi raktai
su paneigimais. #3 taškų žymos dedamos prie antro baltųjų ėjimo; #n prie
priešpaskutinio. H ir s variantai pateikiami pilnai, taškai po paskutinio baltųjų
ėjimo. Etiudui siūlomas 1 taškas už pirmą ėjimą, likusius paskirsto teisėjas.
Naujiems rinkiniams priimami tik etiudai su sprendimu iki 10 numeruotų ėjimų.
Ėjimai trumpinami pagal poziciją (SAN); kai reikia, paliekama figūros linija arba
horizontalė. Nepavykus atkurti šaltinio varianto, kilmės laukelis paliekamas ir
teisėjui rodomas peržiūros įspėjimas. Tai redaguojamas pasiūlymas, ne automatinis
žaidėjo atsakymo įvertinimas.

## Automatiniai rinkiniai ir atranka

Numatytas naujos treniruotės laikas: šeštadienis 10:00 `Europe/Vilnius`, su
vasaros/žiemos laiko kaita. Veikiantis serveris tikrina kas minutę. Po išjungimo
sukuriamas naujausio šeštadienio rinkinys. Treniruotės paskelbiamos automatiškai;
varžybos paliekamos teisėjo peržiūrai. Kompiuteris ir serveris turi veikti.

Pirmo prototipo atskirame rinkinyje yra 486 kandidatų, atrinktų iš YACPDB su
`NOT ReprintType('solving event')`. Tai **neatnaujina sustabdyto pilno #2 importo**:
jo vieta lieka 612 puslapių ir 61 193 įrašai. Papildyti turnyrų kandidatus galima
komanda `npm run import:tournaments`.

Atmetamos žinomos sprendimo varžybų naudojimo žymos, dvyniai, netradicinės
figūros/sąlygos, trūkstami sprendimai ir netaisyklingi įrašai. Kompozicinių konkursų
apdovanojimai nėra laikomi naudojimu sprendimo varžybose. YACPDB žymos nebuvimas
neįrodo, kad uždavinys niekur nebuvo naudotas; patikra remiasi įrašais importo metu.
Prieš tikras varžybas teisėjas papildomai tikrina šaltinius ir sprendimus.

Naudojami tik bent penkerių metų senumo uždaviniai pagal pirmą publikaciją ir
turnyro datą. Nežinoma data atmetama. Kai yra tik metai, konservatyviai laikoma
gruodžio 31 d.; kai nėra dienos, imama paskutinė to mėnesio diena.

#2, #3, #n ir s uždaviniams reikia daugiau kaip 15 figūrų; pirmenybė 20–25.
Etiudams ir h figūrų skaičiaus riba netaikoma. Vien tankumas sunkumo negarantuoja.
Kompozicijų sprendimai šiame režime yra šaltinio sprendimai, ne visų šešių tipų
automatinio analizatoriaus įrodymas. H sprendinių kiekis skaičiuojamas pagal
šaltinio deklaraciją ir pateiktas mato pabaigas; neaiškūs ar nesutampantys įrašai
atmetami. Tų pačių pozicijų turnyrų rinkiniuose nekartojame. Pristigus tinkamų
kandidatų generavimas sustoja su aiškiu pranešimu, o reikalavimai neatlaisvinami.

## Patikra ir failai

`npm run lint`, `npm run build`, `npm run test:solving`. Patikrintas vieno A4
uždavinių PDF, sprendimų bei rezultatų PDF turinys ir diagramos, teisėjo prieiga,
daliniai taškai, dviejų valandų terminas, kalbos ir 320/390 px išdėstymas.

Komponentai: `src/TournamentPlatform.jsx` ir `.css`, `src/TournamentResults.jsx`
ir `.css`. API: `src/tournamentApi.js`. Serveris: `server/tournamentStore.mjs`,
`server/tournamentTools.mjs`, `server/tournamentPdf.mjs`, `server/dev.mjs`.
Duomenys saugomi toje pačioje `data/solving.sqlite` bazėje, atskirose turnyrų lentelėse.

## Turnyrų istorija ir PDF išdėstymas

Puslapio apačioje yra **Turnyrų istorija**. Kiekvienas išsaugotas turnyras turi
nuoseklų numerį ir datą. Galima atidaryti seną rinkinį, jo uždavinių PDF ir
paskelbtus rezultatus; sprendimų PDF atsiranda tik teisėjui juos paskelbus.
Naujas rinkinys senųjų nepanaikina. Pasirinkus turnyrą adrese išsaugomas `set`
identifikatorius: tą adresą galima pasižymėti ir po perkrovimo grįžti į tą rinkinį.
Juodraščiai istorijoje matomi tik teisėjui.

Papildoma kandidatų patikra atmeta sprendimo lauko reikšmes `None`, tuščius
atsakymus ir tekstą be ėjimų sekos. `Dual`, `Cooked`, `Unsound` žymos tikrinamos
raktažodžiuose, komentaruose ir sprendimo anotacijose. `Dual avoidance` yra
kompozicijos tema, todėl nelaikoma defekto žyma. Pakartotinai patikrinus prototipo
turnyrų kandidatų rinkinį pašalinti 69 netinkami įrašai; papildomai atmesti 8
etiudai su ilgesniais nei 10 ėjimų sprendimais, liko 409 kandidatų. Senosiose
istorinėse pozicijose niekas tyliai nekeičiamas pradėjus žaidėjams spręsti.

Uždavinių PDF logotipas centruotas virš didesnio pavadinimo. Numeriai 1.–6.
centruoti virš diagramų, po jomis kairėje yra tipas, dešinėje `(baltos + juodos)`.
Diagramos padidintos, šoninės paraštės sumažintos; visi šeši uždaviniai lieka
viename A4 puslapyje. Sakinio „Points are awarded by the judge.“ PDF nėra.

Sprendimų PDF turi du A4 puslapius: pirmame 1.–3., antrame 4.–6. Kiekvienoje
eilėje diagrama kairėje, išsaugotas teisėjo atsakymas ir pastabos dešinėje.
Raudonos taškų žymos laužomos kartu su tekstu, naudojant aiškias kiekvienos eilės
koordinates. Ilgesniems atsakymams šriftas mažinamas pagal skirtą vietą; jei net
6 pt šriftas netelpa, PDF generavimas prašo sutrumpinti juodraštį, jo nenukerpa.
