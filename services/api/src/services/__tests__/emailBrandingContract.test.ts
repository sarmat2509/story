import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceRoot = process.cwd();
const rendererSource = readFileSync(
  resolve(serviceRoot, 'src/services/transactionalEmailRenderer.ts'),
  'utf8'
);
const emailServiceSource = readFileSync(resolve(serviceRoot, 'src/services/emailService.ts'), 'utf8');
const logoPath = resolve(serviceRoot, '../../apps/universal-app/public/icon-192.png');

assert.ok(existsSync(logoPath), 'the public WonderTales email logo asset must exist');
assert.deepEqual(
  [...readFileSync(logoPath).subarray(0, 8)],
  [137, 80, 78, 71, 13, 10, 26, 10],
  'the email logo must be a real PNG asset'
);
assert.match(rendererSource, /<img src="\$\{brandLogoUrl\}"[^>]*alt="\$\{escapeEmailHtml\(brandName\)\}"/);
assert.doesNotMatch(rendererSource, />\s*WT\s*</);
assert.match(emailServiceSource, /return appUrl\('\/icon-192\.png'\)/);

const rendererCallCount = (emailServiceSource.match(/renderTransactionalEmail\(\{/g) ?? []).length;
const brandedCallCount = (emailServiceSource.match(/brandLogoUrl:\s*brandLogoUrl\(\)/g) ?? []).length;
assert.equal(rendererCallCount, 5, 'the email service should expose all five transactional templates');
assert.equal(
  brandedCallCount,
  rendererCallCount,
  'every transactional email template must pass the WonderTales logo URL'
);

console.log('email branding contract tests passed');
