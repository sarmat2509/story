import assert from 'node:assert/strict';
import { renderLegalHtml, resolveLegalLocale } from '../renderLegalHtml';

void (async function main() {
  assert.equal(resolveLegalLocale(undefined), 'uk');
  assert.equal(resolveLegalLocale('uk'), 'uk');
  assert.equal(resolveLegalLocale('en'), 'en');
  assert.equal(resolveLegalLocale('ru'), 'ru');
  assert.equal(resolveLegalLocale('es'), 'es');
  assert.equal(resolveLegalLocale('de'), 'de');
  assert.equal(resolveLegalLocale('fr'), 'fr');
  assert.equal(resolveLegalLocale('pl'), 'pl');

  const ukTerms = await renderLegalHtml({ doc: 'terms', locale: 'uk' });
  assert.match(ukTerms, /<html lang="uk">/);
  assert.match(ukTerms, /<meta name="robots" content="index,follow">/);
  assert.match(ukTerms, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/terms">/);
  assert.match(ukTerms, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(ukTerms, /hreflang="en" href="https:\/\/app\.wondertales\.com\/en\/terms"/);
  assert.match(ukTerms, /hreflang="ru" href="https:\/\/app\.wondertales\.com\/ru\/terms"/);
  assert.match(ukTerms, /hreflang="es" href="https:\/\/app\.wondertales\.com\/es\/terms"/);
  assert.match(ukTerms, /hreflang="de" href="https:\/\/app\.wondertales\.com\/de\/terms"/);
  assert.match(ukTerms, /hreflang="fr" href="https:\/\/app\.wondertales\.com\/fr\/terms"/);
  assert.match(ukTerms, /hreflang="pl" href="https:\/\/app\.wondertales\.com\/pl\/terms"/);
  assert.match(ukTerms, /hreflang="x-default" href="https:\/\/app\.wondertales\.com\/terms"/);
  assert.match(ukTerms, /href="https:\/\/app\.wondertales\.com\/privacy"/);
  assert.match(ukTerms, /class="site-footer-language"/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/terms" selected>Українська<\/option>/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/en\/terms">English<\/option>/);
  assert.match(ukTerms, /<option value="https:\/\/app\.wondertales\.com\/ru\/terms">Русский<\/option>/);
  assert.doesNotMatch(ukTerms, /Content not available/);

  const enPrivacy = await renderLegalHtml({ doc: 'privacy', locale: 'en' });
  assert.match(enPrivacy, /<html lang="en">/);
  assert.match(enPrivacy, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/en\/privacy">/);
  assert.match(enPrivacy, /hreflang="uk" href="https:\/\/app\.wondertales\.com\/privacy"/);
  assert.match(enPrivacy, /hreflang="en" href="https:\/\/app\.wondertales\.com\/en\/privacy"/);
  assert.match(enPrivacy, /hreflang="pl" href="https:\/\/app\.wondertales\.com\/pl\/privacy"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/en\/terms"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/en\/pricing"/);
  assert.match(enPrivacy, /href="https:\/\/app\.wondertales\.com\/en\/stories"/);
  assert.match(enPrivacy, /<select aria-label="Language"/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/privacy">Українська<\/option>/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/en\/privacy" selected>English<\/option>/);
  assert.match(enPrivacy, /<option value="https:\/\/app\.wondertales\.com\/es\/privacy">Español<\/option>/);
  assert.match(enPrivacy, /parent-managed family storytelling app/);
  assert.match(enPrivacy, /does not replace faces in existing photos or videos/);
  assert.doesNotMatch(enPrivacy, /onchange=/);
  assert.doesNotMatch(enPrivacy, /Content not available/);

  for (const locale of ['ru', 'es', 'de', 'fr', 'pl']) {
    const localizedTerms = await renderLegalHtml({ doc: 'terms', locale });
    const localizedPrivacy = await renderLegalHtml({ doc: 'privacy', locale });
    assert.match(localizedTerms, new RegExp(`<html lang="${locale}">`));
    assert.match(localizedPrivacy, new RegExp(`<html lang="${locale}">`));
    assert.match(localizedTerms, new RegExp(`https://app\\.wondertales\\.com/${locale}/terms`));
    assert.match(localizedPrivacy, new RegExp(`https://app\\.wondertales\\.com/${locale}/privacy`));
    assert.doesNotMatch(localizedTerms, /Content not available/);
    assert.doesNotMatch(localizedPrivacy, /Content not available/);
  }

  console.log('renderLegalHtml tests passed');
})();
