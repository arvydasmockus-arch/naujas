import test from 'node:test';
import assert from 'node:assert/strict';
import { accountTranslations, accountErrorText } from '../src/accountTranslations.js';
import { sprintTranslations } from '../src/sprintTranslations.js';
import { solvingTranslations } from '../src/solvingTranslations.js';
import { tournamentTranslations } from '../src/tournamentTranslations.js';
import { forumTranslations } from '../src/forumTranslations.js';
import { interfaceText, languageLocale, localizedError } from '../src/russianTranslations.js';

test('Russian translations cover every public dictionary key including chess pieces', () => {
  function compare(english, russian, path) {
    assert.deepEqual(Object.keys(russian), Object.keys(english), path);
    for (const [key, value] of Object.entries(english)) {
      if (typeof value === 'object') compare(value, russian[key], `${path}.${key}`);
      else if (/[A-Za-z]/.test(value)) assert.notEqual(russian[key], value, `${path}.${key} must be translated`);
    }
  }
  for (const [name, dictionary] of Object.entries({ accountTranslations, sprintTranslations, solvingTranslations, tournamentTranslations, forumTranslations })) {
    assert.deepEqual(Object.keys(dictionary.lt).sort(), Object.keys(dictionary.en).sort(), `${name}: Lithuanian and English keys match`);
    compare(dictionary.en, dictionary.ru, name);
  }
});

test('Russian errors, login prompt, calendar locale and existing languages are preserved', () => {
  assert.equal(accountErrorText('Slaptažodis turi būti 4–128 simbolių.', 'ru'), 'Пароль должен содержать от 4 до 128 символов.');
  assert.equal(accountErrorText('Neteisingas prisijungimo vardas arba slaptažodis.', 'ru'), 'Неверное имя пользователя или пароль.');
  assert.equal(interfaceText('ru', 'Prisijunkite', 'Log in to start solving.'), 'Войдите, чтобы начать решение.');
  assert.equal(interfaceText('lt', 'Prisijunkite', 'Log in'), 'Prisijunkite');
  assert.equal(interfaceText('en', 'Prisijunkite', 'Log in'), 'Log in');
  assert.equal(languageLocale('ru'), 'ru-RU');
  assert.match(localizedError('D1_ERROR: daily row read limit', 'ru'), /дневной лимит/);
});
