import assert from 'node:assert/strict';
import { PUBLIC_TRANSLATION_LOCALES, buildPublicLegalPath } from '@wondertales/shared';
import { renderLegalHtml, resolveLegalLocale } from '../renderLegalHtml';

void (async function main() {
  assert.equal(resolveLegalLocale(undefined), 'en');
  for (const locale of PUBLIC_TRANSLATION_LOCALES) {
    assert.equal(resolveLegalLocale(locale), locale);
  }

  const ukTerms = await renderLegalHtml({ doc: 'terms', locale: 'uk' });
  assert.match(ukTerms, /<html lang="uk">/);
  assert.match(ukTerms, /<meta name="robots" content="index,follow">/);
  assert.match(ukTerms, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/uk\/terms">/);
  for (const locale of PUBLIC_TRANSLATION_LOCALES) {
    const path = buildPublicLegalPath('terms', locale).replace(/\//g, '\\/');
    assert.match(ukTerms, new RegExp(`hreflang="${locale}" href="https:\\/\\/app\\.wondertales\\.com${path}"`));
  }
  assert.match(ukTerms, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(ukTerms, /href="https:\/\/app\.wondertales\.com\/uk\/privacy"/);
  assert.match(ukTerms, /class="site-footer-language"/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/terms">English<\/option>/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/uk\/terms" selected>Українська<\/option>/);
  assert.doesNotMatch(ukTerms, /Content not available/);

  const enPrivacy = await renderLegalHtml({ doc: 'privacy', locale: 'en' });
  assert.match(enPrivacy, /<html lang="en">/);
  assert.match(enPrivacy, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/privacy">/);
  for (const locale of PUBLIC_TRANSLATION_LOCALES) {
    const path = buildPublicLegalPath('privacy', locale).replace(/\//g, '\\/');
    assert.match(enPrivacy, new RegExp(`hreflang="${locale}" href="https:\\/\\/app\\.wondertales\\.com${path}"`));
  }
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/pricing"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/stories"/);
  assert.match(enPrivacy, /<select aria-label="Language"/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/privacy" selected>English<\/option>/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/uk\/privacy">Українська<\/option>/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/ru\/privacy">Русский<\/option>/);
  assert.match(enPrivacy, /parent-managed family storytelling app/);
  assert.match(enPrivacy, /does not replace faces in existing photos or videos/);
  assert.doesNotMatch(enPrivacy, /onchange=/);
  assert.doesNotMatch(enPrivacy, /Content not available/);

  console.log('renderLegalHtml tests passed');
})();
