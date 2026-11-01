const messages = [
  ['Email queue is unavailable.', 'Laiškų siuntimo eilė laikinai nepasiekiama.', 'Очередь писем временно недоступна.'],
  ['Prepare both ISC PDFs before approving the start.', 'Prieš patvirtindamas startą paruošk abu ISC PDF.', 'Перед подтверждением старта подготовьте оба PDF ISC.'],
  ['ISC training changed. Refresh and prepare the PDFs again.', 'Treniruotė pasikeitė. Atnaujink ir iš naujo paruošk PDF.', 'Тренировка изменилась. Обновите и заново подготовьте PDF.'],
  ['ISC PDF is too large.', 'ISC PDF failas per didelis.', 'Файл PDF ISC слишком большой.'],
  ['Choose a Sunday for ISC training.', 'Pasirink sekmadienį turnyrui.', 'Выберите воскресенье для турнира.'],
  ['Choose a future Sunday.', 'Pasirink būsimą sekmadienį.', 'Выберите будущее воскресенье.'],
  ['Generation must be scheduled before the ISC start and after now.', 'Generavimo laikas turi būti ateityje ir iki treniruotės starto.', 'Время подбора должно быть в будущем, до начала тренировки.'],
  ['Disarm ISC training before editing its problems or deleting it.', 'Prieš taisydamas ar ištrindamas treniruotę atšauk starto patvirtinimą.', 'Перед правками или удалением отмените подтверждение старта.'],
  ['ISC training can no longer be edited after its start.', 'Po starto treniruotės taisyti nebegalima.', 'После старта тренировку изменять нельзя.'],
  ['Register for this ISC training first.', 'Pirmiausia užsiregistruok į šį turnyrą.', 'Сначала зарегистрируйтесь на этот турнир.'],
  ['ISC training has not started yet.', 'Turnyras dar neprasidėjo.', 'Турнир ещё не начался.'],
  ['ISC training has ended.', 'Turnyras jau baigėsi.', 'Турнир уже завершён.'],
  ['Log in to register for ISC training.', 'Prisijunk, kad galėtum registruotis į turnyrą.', 'Войдите, чтобы зарегистрироваться на турнир.'],
  ['Registration is closed.', 'Registracija baigta.', 'Регистрация закрыта.'],
  ['The ISC problem set has already been generated.', 'ISC uždavinių rinkinys jau sugeneruotas.', 'Набор задач ISC уже создан.'],
  ['Email delivery is not configured.', 'Laiškų siuntimas nesukonfigūruotas.', 'Отправка писем не настроена.'],
  ['Generate and review all six ISC problems first.', 'Pirmiausia sugeneruok ir patikrink visus šešis uždavinius.', 'Сначала подберите и проверьте все шесть задач.'],
  ['Announce ISC training before arming the start.', 'Prieš patvirtindamas startą paskelbk registraciją.', 'Перед подтверждением старта откройте регистрацию.'],
  ['Confirm retrying failed deliveries.', 'Patvirtink pakartotinį nepavykusių laiškų siuntimą.', 'Подтвердите повторную отправку неудавшихся писем.'],
  ['The generation deadline has passed.', 'Uždavinių generavimo terminas baigėsi.', 'Срок подбора задач истёк.'],
  ['ISC training is not announced and armed.', 'Turnyro registracija arba startas nepatvirtinti.', 'Регистрация или старт турнира не подтверждены.'],
  ['Delivery needs judge review: retry window expired.', 'Reikia teisėjo patikros: saugus pakartotinio siuntimo laikas baigėsi.', 'Нужна проверка судьи: срок безопасной повторной отправки истёк.'],
  ['The registered account email is no longer verified.', 'Dalyvio paskyros el. paštas nebėra patvirtintas.', 'Почта участника больше не подтверждена.'],
  ['ISC PDF is not available yet.', 'ISC PDF dar nepasiekiamas.', 'PDF ISC пока недоступен.'],
  ['Use the ISC announcement and start controls.', 'Naudok ISC registracijos ir starto valdymo mygtukus.', 'Используйте кнопки управления регистрацией и стартом ISC.'],
];
export function iscError(message, language) {
  const entry = messages.find(([english]) => english === message);
  return entry ? entry[language === 'lt' ? 1 : language === 'ru' ? 2 : 0] : null;
}
