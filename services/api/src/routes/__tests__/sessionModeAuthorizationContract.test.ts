import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ModeEndpointCase {
  method: HttpMethod;
  path: string;
  body?: unknown;
}

const userId = '11111111-1111-4111-8111-111111111111';
const childProfileId = '22222222-2222-4222-8222-222222222222';
const parentSessionId = '33333333-3333-4333-8333-333333333333';
const childSessionId = '44444444-4444-4444-8444-444444444444';

/** Routes registered with requireParentSession. */
const parentOnlyEndpoints: ModeEndpointCase[] = [
  { method: 'DELETE', path: '/api/v1/auth/sessions' },
  { method: 'GET', path: '/api/v1/me' },
  { method: 'PATCH', path: '/api/v1/me', body: {} },
  { method: 'PATCH', path: '/api/v1/me/child-mode-exit-passcode', body: {} },
  { method: 'DELETE', path: '/api/v1/me' },
  { method: 'GET', path: '/api/v1/me/privacy-requests' },
  { method: 'POST', path: '/api/v1/me/privacy-requests', body: {} },
  { method: 'GET', path: '/api/v1/me/sessions' },
  { method: 'DELETE', path: `/api/v1/me/sessions/${parentSessionId}` },
  { method: 'GET', path: '/api/v1/me/oauth-providers' },
  { method: 'POST', path: '/api/v1/me/oauth-providers', body: {} },
  { method: 'DELETE', path: '/api/v1/me/oauth-providers/google' },
  { method: 'POST', path: '/api/v1/children/analyze', body: {} },
  { method: 'GET', path: '/api/v1/children' },
  { method: 'POST', path: '/api/v1/children', body: {} },
  { method: 'GET', path: `/api/v1/children/${childProfileId}/child-mode` },
  { method: 'PATCH', path: `/api/v1/children/${childProfileId}/child-mode`, body: {} },
  { method: 'POST', path: `/api/v1/children/${childProfileId}/child-mode/sessions`, body: {} },
  { method: 'DELETE', path: `/api/v1/children/${childProfileId}/child-mode/sessions` },
  { method: 'PATCH', path: `/api/v1/children/${childProfileId}`, body: {} },
  { method: 'DELETE', path: `/api/v1/children/${childProfileId}` },
  { method: 'POST', path: '/api/v1/mixed-stories', body: {} },
  { method: 'POST', path: '/api/v1/billing/discount-preview', body: {} },
  { method: 'POST', path: '/api/v1/billing/checkout-session', body: {} },
  { method: 'POST', path: '/api/v1/billing/bundle-checkout', body: {} },
  { method: 'POST', path: '/api/v1/billing/portal-session', body: {} },
  { method: 'POST', path: '/api/v1/stories', body: {} },
  { method: 'POST', path: `/api/v1/stories/requests/${userId}/retry-images`, body: {} },
  { method: 'PATCH', path: `/api/v1/stories/${userId}/parent-review`, body: {} },
  { method: 'DELETE', path: `/api/v1/stories/${userId}` },
  { method: 'POST', path: `/api/v1/stories/${userId}/schedule-continuation`, body: {} },
  { method: 'DELETE', path: `/api/v1/stories/${userId}/schedule-continuation` },
  { method: 'POST', path: `/api/v1/stories/${userId}/alignment`, body: {} },
  { method: 'POST', path: `/api/v1/stories/${userId}/scenes/1/regenerate`, body: {} },
  { method: 'GET', path: '/api/v1/bundles' },
  { method: 'POST', path: '/api/v1/graphic-novels', body: {} },
  { method: 'GET', path: '/api/v1/plans/with-features' },
  { method: 'PUT', path: '/api/v1/plans/billing-currency', body: {} },
  { method: 'PUT', path: '/api/v1/plans/upgrade', body: {} },
  { method: 'GET', path: '/api/v1/entitlements' },
  { method: 'DELETE', path: `/api/v1/characters/${userId}` },
  { method: 'PATCH', path: `/api/v1/characters/${userId}`, body: {} },
];

/** Routes registered with strict requireChildSession (not shared/scoped-child middleware). */
const childOnlyEndpoints: ModeEndpointCase[] = [
  { method: 'POST', path: '/api/v1/auth/parent-gate/google/start', body: {} },
  { method: 'POST', path: '/api/v1/auth/parent-gate/apple/start', body: {} },
  { method: 'POST', path: '/api/v1/auth/parent-gate/google-token', body: {} },
  { method: 'POST', path: '/api/v1/auth/parent-gate/apple-token', body: {} },
  { method: 'POST', path: '/api/v1/auth/parent-gate', body: {} },
  { method: 'GET', path: '/api/v1/children/child-mode/current' },
  { method: 'POST', path: '/api/v1/stories/child-mode', body: {} },
];

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test HTTP server did not expose a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'mode-contract@example.test',
    displayName: 'Mode Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now,
  } as any;
  const parentSession = {
    id: parentSessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    token: 'parent-repository-token',
    deviceName: null,
    deviceType: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const childSession = {
    ...parentSession,
    id: childSessionId,
    mode: 'child',
    childProfileId,
    scopes: ['child_mode'],
    token: 'child-repository-token',
  } as any;
  const sessionsById = new Map([
    [parentSessionId, { session: parentSession, user }],
    [childSessionId, { session: childSession, user }],
  ]);

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (sessionId: string) => sessionsById.get(sessionId) ?? null,
      updateLastActive: async () => undefined,
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;
  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;

  try {
    for (const [endpointIndex, endpoint] of parentOnlyEndpoints.entries()) {
      const response = await fetch(`${origin}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          authorization: childAuthorization,
          'x-forwarded-for': `198.51.100.${endpointIndex + 1}`,
          ...(endpoint.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
      });
      assert.equal(
        response.status,
        403,
        `${endpoint.method} ${endpoint.path} must reject a child session with 403`
      );
    }

    for (const [endpointIndex, endpoint] of childOnlyEndpoints.entries()) {
      const response = await fetch(`${origin}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          authorization: parentAuthorization,
          'x-forwarded-for': `203.0.113.${endpointIndex + 1}`,
          ...(endpoint.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
      });
      assert.equal(
        response.status,
        403,
        `${endpoint.method} ${endpoint.path} must reject a parent session with 403`
      );
    }
  } finally {
    await close(server);
    clearRepositoryTestOverrides();
  }

  console.log(
    `session mode authorization contract passed (${parentOnlyEndpoints.length} parent-only, ${childOnlyEndpoints.length} child-only endpoints)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
