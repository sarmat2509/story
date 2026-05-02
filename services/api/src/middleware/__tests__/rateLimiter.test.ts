import assert from 'node:assert';
import type { Request } from 'express';
import { getExpensiveGenerationRateLimitKey } from '../rateLimiter';

function makeRequest(overrides: Partial<Request>): Request {
  return overrides as Request;
}

void (async function main() {
  assert.strictEqual(
    getExpensiveGenerationRateLimitKey(makeRequest({
      user: { id: 'user-1' } as Request['user'],
      headers: {},
    })),
    'user:user-1',
    'authenticated parent requests are keyed by user id'
  );

  assert.strictEqual(
    getExpensiveGenerationRateLimitKey(makeRequest({
      user: { id: 'child-session-user' } as Request['user'],
      parentUserId: 'parent-1',
      headers: {},
    })),
    'user:parent-1',
    'child sessions are keyed by parent owner id'
  );

  assert.strictEqual(
    getExpensiveGenerationRateLimitKey(makeRequest({
      headers: {
        'x-forwarded-for': '203.0.113.42, 10.0.0.2',
      },
    })),
    'ip:203.0.113.42',
    'fallback key uses the first forwarded client IP'
  );

  assert.strictEqual(
    getExpensiveGenerationRateLimitKey(makeRequest({
      headers: {
        'x-real-ip': '198.51.100.7',
      },
    })),
    'ip:198.51.100.7',
    'fallback key uses x-real-ip when forwarded-for is absent'
  );

  console.log('rateLimiter tests passed');
})();
