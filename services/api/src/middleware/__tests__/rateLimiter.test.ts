import assert from 'node:assert';
import type { Request } from 'express';
import {
  getExpensiveGenerationRateLimitKey,
  getRateLimitLogContext,
  hashRateLimitIdentity,
} from '../rateLimiter';

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

  const ipHash = hashRateLimitIdentity('203.0.113.42');
  assert.match(ipHash, /^[a-f0-9]{16}$/);
  assert.notStrictEqual(ipHash, '203.0.113.42', 'IP identities are hashed before log output');

  const anonymousContext = getRateLimitLogContext(makeRequest({
    method: 'POST',
    baseUrl: '/api/v1/auth',
    headers: {
      'x-forwarded-for': '203.0.113.42, 10.0.0.2',
    },
    rateLimit: {
      limit: 5,
      used: 6,
      remaining: 0,
      resetTime: new Date('2026-05-02T12:00:00.000Z'),
    },
  } as Partial<Request>), 'password_reset');

  assert.deepStrictEqual(
    anonymousContext,
    {
      abuseSignal: true,
      limiterName: 'password_reset',
      method: 'POST',
      routeBase: '/api/v1/auth',
      keyScope: 'ip',
      userId: undefined,
      clientIpHash: ipHash,
      limit: 5,
      used: 6,
      remaining: 0,
      resetTime: '2026-05-02T12:00:00.000Z',
    },
    'rate-limit log context is coarse and avoids raw IP or URL details'
  );

  const childSessionContext = getRateLimitLogContext(makeRequest({
    method: 'POST',
    baseUrl: '/api/v1/stories',
    parentUserId: 'parent-1',
    user: { id: 'child-session-user' } as Request['user'],
    headers: {
      'x-real-ip': '198.51.100.7',
    },
  }), 'expensive_generation');

  assert.strictEqual(childSessionContext.keyScope, 'user');
  assert.strictEqual(childSessionContext.userId, 'parent-1');

  console.log('rateLimiter tests passed');
})();
