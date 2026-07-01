import assert from 'node:assert/strict';
import { renderLandingHtml } from '../renderLandingHtml';

function extractJsonLd(html: string): any[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

const html = renderLandingHtml({ locale: 'en' });
const jsonLd = extractJsonLd(html);
const software = jsonLd.find((entry) => entry['@type'] === 'SoftwareApplication');
const faq = jsonLd.find((entry) => entry['@type'] === 'FAQPage');

assert.ok(software, 'landing should expose SoftwareApplication structured data');
assert.equal(software.name, 'WonderTales');
assert.equal(software.url, 'https://app.wondertales.com');
assert.equal(software.offers.url, 'https://app.wondertales.com/pricing');
assert.equal(software.inLanguage, 'en');

assert.ok(faq, 'landing should expose FAQPage structured data');
assert.equal(faq.inLanguage, 'en');
assert.ok(Array.isArray(faq.mainEntity));
assert.ok(faq.mainEntity.length > 0);
assert.equal(faq.mainEntity[0]['@type'], 'Question');
assert.equal(faq.mainEntity[0].acceptedAnswer['@type'], 'Answer');
assert.doesNotMatch(faq.mainEntity.map((item: any) => item.acceptedAnswer.text).join('\n'), /<a\b/);
assert.match(html, /href="https:\/\/app\.wondertales\.com\/pricing" class="cta-purple"/);
assert.match(html, /href="https:\/\/app\.wondertales\.com\/pricing" class="cta-purple-outline"/);

console.log('renderLandingStructuredData tests passed');
