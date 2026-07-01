import assert from 'node:assert/strict';
import { renderLegalHtml, resolveLegalLocale } from '../renderLegalHtml';

void (async function main() {
  assert.equal(resolveLegalLocale(undefined), 'en');
  assert.equal(resolveLegalLocale('uk'), 'uk');
  assert.equal(resolveLegalLocale('en'), 'en');
  assert.equal(resolveLegalLocale('ru'), 'en');
  assert.equal(resolveLegalLocale('es'), 'en');
  assert.equal(resolveLegalLocale('de'), 'en');
  assert.equal(resolveLegalLocale('fr'), 'en');
  assert.equal(resolveLegalLocale('pl'), 'en');

  const ukTerms = await renderLegalHtml({ doc: 'terms', locale: 'uk' });
  assert.match(ukTerms, /<html lang="uk">/);
  assert.match(ukTerms, /<meta name="robots" content="index,follow">/);
  assert.match(ukTerms, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/uk\/terms">/);
  assert.match(ukTerms, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/uk\/terms"/);
  assert.match(ukTerms, /hreflang="en" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.doesNotMatch(ukTerms, /hreflang="(?:ru|es|de|fr|pl)"/);
  assert.match(ukTerms, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(ukTerms, /href="https:\/\/app\.wondertales\.com\/uk\/privacy"/);
  assert.match(ukTerms, /class="site-footer-language"/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/terms">English<\/option>/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/uk\/terms" selected>Українська<\/option>/);
  assert.doesNotMatch(ukTerms, /Content not available/);

  const enPrivacy = await renderLegalHtml({ doc: 'privacy', locale: 'en' });
  assert.match(enPrivacy, /<html lang="en">/);
  assert.match(enPrivacy, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/privacy">/);
  assert.match(enPrivacy, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/uk\/privacy"/);
  assert.match(enPrivacy, /hreflang="en" href="https:\/\/app\.wondertales\.com\/privacy"/);
  assert.doesNotMatch(enPrivacy, /hreflang="(?:ru|es|de|fr|pl)"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/pricing"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/stories"/);
  assert.match(enPrivacy, /<select aria-label="Language"/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/privacy" selected>English<\/option>/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/uk\/privacy">Українська<\/option>/);
  assert.match(enPrivacy, /parent-managed family storytelling app/);
  assert.match(enPrivacy, /does not replace faces in existing photos or videos/);
  assert.doesNotMatch(enPrivacy, /onchange=/);
  assert.doesNotMatch(enPrivacy, /Content not available/);

  console.log('renderLegalHtml tests passed');
})();
