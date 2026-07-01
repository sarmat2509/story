import assert from 'node:assert/strict';
import { renderSupportHtml } from '../renderSupportHtml';

const enHtml = renderSupportHtml({ locale: 'en' });
assert.match(enHtml, /<html lang="en">/);
assert.match(enHtml, /<title>Support — WonderTales<\/title>/);
assert.match(enHtml, /<meta name="robots" content="index,follow">/);
assert.match(enHtml, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/support">/);
assert.match(enHtml, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/uk\/support"/);
assert.match(enHtml, /hreflang="en" href="https:\/\/app\.wondertales\.com\/support"/);
assert.doesNotMatch(enHtml, /hreflang="(?:ru|es|de|fr|pl)"/);
assert.match(enHtml, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/support"/);
assert.match(enHtml, /Contact WonderTales support/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/support" selected>English<\/option>/);

const deHtml = renderSupportHtml({ locale: 'de' });
assert.match(deHtml, /<html lang="en">/);
assert.match(deHtml, /<title>Support — WonderTales<\/title>/);
assert.match(deHtml, /Contact WonderTales support/);
assert.match(deHtml, /href="https:\/\/app\.wondertales\.com\/pricing"/);
assert.doesNotMatch(deHtml, /Deutsch<\/option>/);

console.log('renderSupportHtml tests passed');
