import assert from 'node:assert/strict';
import { renderSupportHtml } from '../renderSupportHtml';

const enHtml = renderSupportHtml({ locale: 'en' });
assert.match(enHtml, /<html lang="en">/);
assert.match(enHtml, /<title>Support — WonderTales<\/title>/);
assert.match(enHtml, /<meta name="robots" content="noindex,follow">/);
assert.match(enHtml, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/en\/support">/);
assert.match(enHtml, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/support"/);
assert.match(enHtml, /hreflang="en" href="https:\/\/app\.wondertales\.com\/en\/support"/);
assert.match(enHtml, /hreflang="ru" href="https:\/\/app\.wondertales\.com\/ru\/support"/);
assert.match(enHtml, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/support"/);
assert.match(enHtml, /Contact WonderTales support/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/en\/support" selected>English<\/option>/);

const deHtml = renderSupportHtml({ locale: 'de' });
assert.match(deHtml, /<html lang="de">/);
assert.match(deHtml, /<title>Support — WonderTales<\/title>/);
assert.match(deHtml, /Kontaktiere den WonderTales-Support/);
assert.match(deHtml, /href="https:\/\/app\.wondertales\.com\/de\/pricing"/);
assert.match(deHtml, /<option value="https:\/\/app\.wondertales\.com\/de\/support" selected>Deutsch<\/option>/);

console.log('renderSupportHtml tests passed');
