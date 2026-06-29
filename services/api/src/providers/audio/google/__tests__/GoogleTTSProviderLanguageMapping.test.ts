import assert from 'node:assert/strict';
import { GoogleTTSProvider } from '../GoogleTTSProvider';

const mapLanguageCode = (GoogleTTSProvider.prototype as any).mapLanguageCode as (lang: string) => string;
const unmapLanguageCode = (GoogleTTSProvider.prototype as any).unmapLanguageCode as (langCode: string) => string;

assert.equal(mapLanguageCode('uk'), 'uk-UA');
assert.equal(mapLanguageCode('ru'), 'ru-RU');
assert.equal(mapLanguageCode('en'), 'en-US');
assert.equal(mapLanguageCode('es'), 'es-ES');
assert.equal(mapLanguageCode('de'), 'de-DE');
assert.equal(mapLanguageCode('fr'), 'fr-FR');
assert.equal(mapLanguageCode('pl'), 'pl-PL');

assert.equal(unmapLanguageCode('uk-UA'), 'uk');
assert.equal(unmapLanguageCode('ru-RU'), 'ru');
assert.equal(unmapLanguageCode('en-US'), 'en');
assert.equal(unmapLanguageCode('es-ES'), 'es');
assert.equal(unmapLanguageCode('de-DE'), 'de');
assert.equal(unmapLanguageCode('fr-FR'), 'fr');
assert.equal(unmapLanguageCode('pl-PL'), 'pl');

console.log('GoogleTTSProviderLanguageMapping tests passed');
