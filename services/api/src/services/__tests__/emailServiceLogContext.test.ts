import assert from 'node:assert';
import { buildSafeEmailLogContext } from '../emailService';

void (async function main() {
  const context = buildSafeEmailLogContext('  Parent.User+QA@Example.COM  ');
  const normalizedContext = buildSafeEmailLogContext('parent.user+qa@example.com');
  const otherContext = buildSafeEmailLogContext('other@example.com');

  assert.strictEqual(context.recipientDomain, 'example.com');
  assert.match(context.recipientHash, /^[a-f0-9]{16}$/);
  assert.strictEqual(context.recipientHash, normalizedContext.recipientHash);
  assert.notStrictEqual(context.recipientHash, otherContext.recipientHash);
  assert.strictEqual((context as Record<string, unknown>).to, undefined);
  assert.strictEqual((context as Record<string, unknown>).email, undefined);
  assert.strictEqual(JSON.stringify(context).includes('Parent.User'), false);
  assert.strictEqual(buildSafeEmailLogContext('not-an-email').recipientDomain, 'invalid');

  console.log('emailServiceLogContext tests passed');
})();
