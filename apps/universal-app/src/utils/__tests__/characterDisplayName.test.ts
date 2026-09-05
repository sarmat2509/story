import assert from 'node:assert/strict';
import {
  getCharacterDisplayName,
  getStoryCharacterDisplayName,
  normalizeInterfaceLocale,
} from '../characterDisplayName';

const character = {
  name: 'Бронированный Утя-Герой',
  localizedName: 'Бронированный Утя-Герой',
  nameTranslations: {
    uk: 'Броньований Качур-Герой',
    ru: 'Бронированный Утя-Герой',
    en: 'Armored Duck Hero',
  },
};

assert.equal(normalizeInterfaceLocale('uk-UA'), 'uk');
assert.equal(getCharacterDisplayName(character, 'uk-UA'), 'Броньований Качур-Герой');
assert.equal(getCharacterDisplayName(character, 'en'), 'Armored Duck Hero');
assert.equal(
  getCharacterDisplayName({ ...character, nameTranslations: undefined }, 'uk'),
  'Бронированный Утя-Герой',
  'canonical name should be used when the interface translation is unavailable'
);
assert.equal(
  getStoryCharacterDisplayName(character),
  'Бронированный Утя-Герой',
  'a story must keep the name used by its text even when the interface has another locale'
);

console.log('character display-name locale tests passed');
