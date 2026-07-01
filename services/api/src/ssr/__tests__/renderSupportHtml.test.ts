import assert from 'node:assert/strict';
import { PUBLIC_TRANSLATION_LOCALES, buildPublicSupportPath } from '@wondertales/shared';
import { renderSupportHtml } from '../renderSupportHtml';

const enHtml = renderSupportHtml({ locale: 'en' });
assert.match(enHtml, /<html lang="en">/);
assert.match(enHtml, /<title>Support — WonderTales<\/title>/);
assert.match(enHtml, /<meta name="robots" content="index,follow">/);
assert.match(enHtml, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/support">/);
for (const locale of PUBLIC_TRANSLATION_LOCALES) {
  const path = buildPublicSupportPath(locale).replace(/\//g, '\\/');
  assert.match(enHtml, new RegExp(`hreflang="${locale}" href="https:\\/\\/app\\.wondertales\\.com${path}"`));
}
assert.match(enHtml, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/support"/);
assert.match(enHtml, /Contact WonderTales support/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/support" selected>English<\/option>/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/de\/support">Deutsch<\/option>/);

const deHtml = renderSupportHtml({ locale: 'de' });
assert.match(deHtml, /<html lang="de">/);
assert.match(deHtml, /<title>Support — WonderTales<\/title>/);
assert.match(deHtml, /Kontaktiere den WonderTales-Support/);
assert.match(deHtml, /href="https:\/\/app\.wondertales\.com\/de\/pricing"/);
assert.match(deHtml, /<option value="https:\/\/app\.wondertales\.com\/de\/support" selected>Deutsch<\/option>/);

console.log('renderSupportHtml tests passed');
