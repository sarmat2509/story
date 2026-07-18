import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'b0111111-1111-4111-8111-111111111111';
const sessionId = 'b0222222-2222-4222-8222-222222222222';

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
  const { clearDatabaseHealthTestOverride, installDatabaseHealthTestOverride } =
    await import('../../db');
  const { clearAiServiceTestOverrides, installAiServiceTestOverrides, stopAllRateLimiters } =
    await import('../../services/aiService');

  const now = new Date();
  const user = {
    id: userId,
    email: 'health-ops@example.test',
    displayName: 'Health Ops',
    role: 'admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  } as any;
  const session = {
    id: sessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const queueStats = {
    pending: 0,
    processing: 0,
    completed: 2,
    failed: 0,
  };

  installDatabaseHealthTestOverride(async () => true);
  installAiServiceTestOverrides({
    imageQuotaProvider: {
      getRPMLimit: async () => 30,
      getCachedLimit: () => 30,
      reduceRPMLimit: () => 27,
      setRPMLimit: () => undefined,
      clearCache: () => undefined,
    },
  });
  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: { findById: async () => user } as any,
    opsRuntime: {
      getGlobalState: async () => ({
        mode: 'normal',
        message: null,
        startsAt: null,
        endsAt: null,
        updatedAt: now,
      }),
    } as any,
    generationJob: { getStats: async () => queueStats } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    const healthBody = (await health.json()) as any;
    assert.equal(healthBody.status, 'healthy');
    assert.equal(healthBody.database, 'connected');

    const ops = await fetch(`${origin}/api/v1/ops/status`);
    assert.equal(ops.status, 200);
    const opsBody = (await ops.json()) as any;
    assert.equal(opsBody.ops.mode, 'normal');
    assert.equal(opsBody.ops.active, false);

    const detailedUnauthorized = await fetch(`${origin}/health/detailed`);
    assert.equal(detailedUnauthorized.status, 401);

    const adminGet = (path: string) =>
      fetch(`${origin}${path}`, { headers: { authorization } });
    const detailed = await adminGet('/health/detailed');
    assert.equal(detailed.status, 200);
    const detailedBody = (await detailed.json()) as any;
    assert.equal(detailedBody.services.database.healthy, true);
    assert.equal(detailedBody.services.imageRateLimiter.status, 'active');

    const queues = await adminGet('/health/queues');
    assert.equal(queues.status, 200);
    const queuesBody = (await queues.json()) as any;
    assert.deepEqual(queuesBody.queues.text.pending, 0);
    assert.deepEqual(queuesBody.queues.legacy.completed, 2);

    const limiter = await adminGet('/health/image-rate-limiter');
    assert.equal(limiter.status, 200);
    const limiterBody = (await limiter.json()) as any;
    assert.equal(limiterBody.rateLimiter.maxRPM, 30);
    assert.equal(limiterBody.quotaProvider.cachedLimit, 30);
  } finally {
    stopAllRateLimiters();
    clearAiServiceTestOverrides();
    clearDatabaseHealthTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('health and ops HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
