import assert from 'node:assert/strict';
import { renderLegalHtml, resolveLegalLocale } from '../renderLegalHtml';

void (async function main() {
  const unsupportedLocales = ['ru', 'es', 'de', 'fr', 'pl'];

  assert.equal(resolveLegalLocale(undefined), 'uk');
  assert.equal(resolveLegalLocale('uk'), 'uk');
  assert.equal(resolveLegalLocale('en'), 'en');
  assert.equal(resolveLegalLocale('ru'), 'uk');

  const ukTerms = await renderLegalHtml({ doc: 'terms', locale: 'uk' });
  assert.match(ukTerms, /<html lang="uk">/);
  assert.match(ukTerms, /<meta name="robots" content="index,follow">/);
  assert.match(ukTerms, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/terms">/);
  assert.match(ukTerms, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(ukTerms, /hreflang="en" href="https:\/\/app\.wondertales\.com\/en\/terms"/);
  assert.match(ukTerms, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(ukTerms, /href="https:\/\/app\.wondertales\.com\/privacy"/);
  assert.doesNotMatch(ukTerms, /Content not available/);

  const enPrivacy = await renderLegalHtml({ doc: 'privacy', locale: 'en' });
  assert.match(enPrivacy, /<html lang="en">/);
  assert.match(enPrivacy, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/en\/privacy">/);
  assert.match(enPrivacy, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/privacy"/);
  assert.match(enPrivacy, /hreflang="en" href="https:\/\/app\.wondertales\.com\/en\/privacy"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/en\/terms"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/en\/pricing"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/en\/stories"/);
  assert.doesNotMatch(enPrivacy, /Content not available/);

  for (const locale of unsupportedLocales) {
    assert.doesNotMatch(enPrivacy, new RegExp(`hreflang="${locale}"`));
    assert.doesNotMatch(enPrivacy, new RegExp(`/${locale}/privacy`));
    assert.doesNotMatch(ukTerms, new RegExp(`/${locale}/terms`));
  }

  console.log('renderLegalHtml tests passed');
})();
