import { russianLabels } from './russianTranslations.js';
export const sprintTranslations = {
  en: {
    missingRound: 'The round for this date is not available yet. Choose an earlier date in the calendar.',
    title: '3 × #2 · 20-minute tournament', subtitle: '#2 training competition simulation.',

    name: 'Player name', start: 'Start the 20-minute clock', remaining: 'Time remaining', submit: 'Finish and submit answers',
    problem: 'Problem', pieces: 'pieces', yourMove: 'Your key move', submitHint: 'Answers are scored automatically. You can finish early; at 00:00 your current answers are submitted.',
    submitted: 'Answers submitted', score: 'Score', elapsed: 'Time used', locked: 'The daily round has been submitted.',
    daily: 'Today’s leaderboard', overall: 'Overall tournament leaderboard', winners: 'Daily winners', place: 'Place', player: 'Player', points: 'Points',
    rounds: 'Rounds', averageTime: 'Average time', date: 'Date', noResults: 'No results submitted yet.', noWinners: 'No daily winners yet.',
    error: 'The tournament could not be loaded.', invalidMove: 'Enter a legal first move, such as Qa5.', switchPlayer: 'Switch player', undoMove: 'Undo move',
  },
  lt: {
    missingRound: 'Šios dienos rinkinys dar neparuoštas. Kalendoriuje pasirinkite ankstesnę dieną.',
    title: '3 × #2 · 20 minučių turnyras', subtitle: '#2 treniruo\u010di\u0173 var\u017eyb\u0173 simuliacija.',

    name: 'Žaidėjo vardas', start: 'Pradėti 20 minučių laiką', remaining: 'Liko laiko', submit: 'Baigti ir pateikti atsakymus',
    problem: 'Uždavinys', pieces: 'figūros', yourMove: 'Jūsų raktinis ėjimas', submitHint: 'Atsakymai tikrinami automatiškai. Galite baigti anksčiau; laikui pasibaigus pateikiami įrašyti atsakymai.',
    submitted: 'Atsakymai pateikti', score: 'Taškai', elapsed: 'Sugaištas laikas', locked: 'Šios dienos turnyras jau pateiktas.',
    daily: 'Šiandienos lentelė', overall: 'Bendra turnyrų lentelė', winners: 'Dienos turnyrų nugalėtojai', place: 'Vieta', player: 'Žaidėjas', points: 'Taškai',
    rounds: 'Turnyrai', averageTime: 'Vidutinis laikas', date: 'Data', noResults: 'Atsakymų dar nepateikė.', noWinners: 'Dienos nugalėtojų dar nėra.',
    error: 'Nepavyko įkelti turnyro.', invalidMove: 'Įrašykite legalų pirmąjį ėjimą, pavyzdžiui, Qa5.', switchPlayer: 'Keisti žaidėją', undoMove: 'Atšaukti ėjimą',
  },
};

sprintTranslations.ru = russianLabels(sprintTranslations.en);
