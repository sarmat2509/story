import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface AdminEndpointCase {
  method: HttpMethod;
  path: string;
  body?: unknown;
}

const id = '11111111-1111-4111-8111-111111111111';

/**
 * Every route guarded by requireAdmin in the production routers.
 * Cases contain request data only; authorization remains production behavior.
 */
const adminOnlyEndpoints: AdminEndpointCase[] = [
  { method: 'GET', path: '/api/v1/admin/dashboard' },
  { method: 'GET', path: '/api/v1/admin/ops/runtime' },
  { method: 'PATCH', path: '/api/v1/admin/ops/runtime', body: {} },
  { method: 'GET', path: `/api/v1/admin/jobs/${id}` },
  { method: 'GET', path: '/api/v1/admin/stories' },
  { method: 'PATCH', path: `/api/v1/admin/stories/${id}`, body: {} },
  { method: 'GET', path: '/api/v1/admin/users' },
  { method: 'GET', path: '/api/v1/admin/discount-codes/options' },
  { method: 'GET', path: '/api/v1/admin/discount-codes' },
  { method: 'POST', path: '/api/v1/admin/discount-codes', body: {} },
  { method: 'PATCH', path: `/api/v1/admin/discount-codes/${id}`, body: {} },
  { method: 'GET', path: '/api/v1/admin/outfits' },
  { method: 'POST', path: '/api/v1/admin/outfits/search', body: {} },
  { method: 'GET', path: '/api/v1/admin/environments' },
  { method: 'POST', path: '/api/v1/admin/environments/search', body: {} },
  { method: 'GET', path: '/api/v1/admin/voices' },
  { method: 'PATCH', path: `/api/v1/admin/voices/${id}`, body: {} },
  { method: 'GET', path: '/api/v1/admin/feedback' },
  { method: 'GET', path: '/api/v1/admin/moderation-decisions' },
  { method: 'GET', path: '/api/v1/admin/privacy-requests' },
  { method: 'GET', path: `/api/v1/admin/privacy-requests/${id}/export` },
  { method: 'PATCH', path: `/api/v1/admin/privacy-requests/${id}`, body: {} },
  { method: 'PATCH', path: `/api/v1/admin/users/${id}`, body: {} },
  { method: 'DELETE', path: `/api/v1/admin/users/${id}` },
  { method: 'GET', path: '/api/v1/admin/image-validations' },
  {
    method: 'GET',
    path: '/api/v1/admin/image-validations/analytics/character-regenerations',
  },
  { method: 'GET', path: `/api/v1/admin/image-validations/${id}/image` },
  { method: 'GET', path: `/api/v1/admin/image-validations/${id}` },
  {
    method: 'POST',
    path: `/api/v1/admin/image-validations/${id}/apply-best-scene-image`,
    body: {},
  },
  { method: 'POST', path: `/api/v1/admin/stories/${id}/audio/reset`, body: {} },
  { method: 'GET', path: `/api/v1/admin/assets/${id}/image` },
  { method: 'GET', path: '/api/v1/admin/map-tile-masks/A/image' },
  { method: 'GET', path: `/api/v1/admin/stories/${id}/director-scenes` },
  {
    method: 'POST',
    path: `/api/v1/admin/stories/${id}/scenes/1/regenerate-image`,
    body: {},
  },
  {
    method: 'POST',
    path: `/api/v1/admin/stories/${id}/graphic-novel-pages/1/regenerate-image`,
    body: {},
  },
  { method: 'GET', path: '/api/v1/admin/content-config/story-goals' },
  { method: 'POST', path: '/api/v1/admin/content-config/story-goals', body: {} },
  { method: 'PATCH', path: `/api/v1/admin/content-config/story-goals/${id}`, body: {} },
  { method: 'DELETE', path: `/api/v1/admin/content-config/story-goals/${id}` },
  { method: 'GET', path: '/api/v1/admin/app-releases' },
  { method: 'GET', path: `/api/v1/admin/app-releases/${id}` },
  { method: 'POST', path: '/api/v1/admin/app-releases', body: {} },
  { method: 'PUT', path: `/api/v1/admin/app-releases/${id}`, body: {} },
  { method: 'GET', path: `/api/v1/admin/app-releases/${id}/email-preview/en` },
  { method: 'POST', path: `/api/v1/admin/app-releases/${id}/media`, body: {} },
  { method: 'DELETE', path: `/api/v1/admin/app-releases/${id}/media/${id}` },
  { method: 'GET', path: '/health/detailed' },
  { method: 'GET', path: '/health/queues' },
  { method: 'GET', path: '/health/image-rate-limiter' },
  { method: 'GET', path: '/api/v1/image-validations' },
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
    id,
    email: 'non-admin-contract@example.test',
    displayName: 'Non-admin Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now,
  } as any;
  const session = {
    id,
    userId: id,
    mode: 'parent',
    parentUserId: id,
    childProfileId: null,
    scopes: [],
    token: 'repository-token',
    deviceName: null,
    deviceType: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const authorization = `Bearer ${generateToken({ userId: id, sessionId: id })}`;

  try {
    for (const endpoint of adminOnlyEndpoints) {
      const response = await fetch(`${origin}${endpoint.path}`, {
        method: endpoint.method,
        headers:
          endpoint.body === undefined
            ? { authorization }
            : { authorization, 'content-type': 'application/json' },
        body: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
      });
      assert.equal(
        response.status,
        403,
        `${endpoint.method} ${endpoint.path} must reject an authenticated non-admin with 403`
      );
    }
  } finally {
    await close(server);
    clearRepositoryTestOverrides();
  }

  console.log(
    `admin API authorization contract passed (${adminOnlyEndpoints.length} admin endpoints)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
