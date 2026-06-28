import assert from 'node:assert/strict';
import { renderLandingHtml } from '../renderLandingHtml';

const enHtml = renderLandingHtml({ locale: 'en' });

assert.match(enHtml, /Parent control and privacy from the first story/);
assert.match(enHtml, /Parent-owned accounts/);
assert.match(enHtml, /Private by default/);
assert.match(enHtml, /Child Mode with boundaries/);
assert.match(enHtml, /Deletion and support/);
assert.match(enHtml, /href="https:\/\/app\.wondertales\.com\/en\/privacy"/);
assert.match(enHtml, /href="https:\/\/app\.wondertales\.com\/support"/);
assert.doesNotMatch(enHtml, /href="https:\/\/app\.wondertales\.com\/privacy">Privacy policy/);

const ukHtml = renderLandingHtml({ locale: 'uk' });

assert.match(ukHtml, /Батьківський контроль і приватність з першої історії/);
assert.match(ukHtml, /Акаунт належить дорослому/);
assert.match(ukHtml, /Приватно за замовчуванням/);
assert.match(ukHtml, /Дитячий режим з межами/);
assert.match(ukHtml, /Видалення даних і підтримка/);
assert.match(ukHtml, /href="https:\/\/app\.wondertales\.com\/privacy"/);
assert.match(ukHtml, /href="https:\/\/app\.wondertales\.com\/support"/);
assert.doesNotMatch(ukHtml, /\/uk\/privacy/);

const esHtml = renderLandingHtml({ locale: 'es' });

assert.match(esHtml, /Control parental y privacidad desde la primera historia/);
assert.match(esHtml, /href="https:\/\/app\.wondertales\.com\/es\/privacy"/);

console.log('renderLandingTrustLayer tests passed');
