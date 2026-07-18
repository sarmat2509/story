import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'd0111111-1111-4111-8111-111111111111';
const sessionId = 'd0222222-2222-4222-8222-222222222222';
const storyId = 'd0333333-3333-4333-8333-333333333333';

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
    email: 'image-validations@example.test',
    displayName: 'Image Validations',
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
  const validation = {
    id: 'd0444444-4444-4444-8444-444444444444',
    storyId,
    sceneIndex: 2,
    attempt: 1,
    imageStoragePath: 'test/image.png',
    validationScore: 0.91,
    validationStatus: 'completed',
    visionModel: 'contract-vision',
    requestManifest: { required: ['character'] },
    providerError: null,
    result: { passed: true },
    createdAt: now,
  } as any;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: { findById: async () => user } as any,
    imageValidation: {
      listAll: async () => [validation],
      countAll: async () => 1,
      listByStoryId: async (requestedStoryId: string) =>
        requestedStoryId === storyId ? [validation] : [],
      countByStoryId: async (requestedStoryId: string) => (requestedStoryId === storyId ? 1 : 0),
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const unauthorized = await fetch(`${origin}/api/v1/image-validations`);
    assert.equal(unauthorized.status, 401);

    const invalid = await fetch(`${origin}/api/v1/image-validations?limit=0`, {
      headers: { authorization },
    });
    assert.equal(invalid.status, 400);

    const all = await fetch(`${origin}/api/v1/image-validations?limit=10&offset=0`, {
      headers: { authorization },
    });
    assert.equal(all.status, 200);
    const allBody = (await all.json()) as any;
    assert.equal(allBody.data.meta.total, 1);
    assert.equal(allBody.data.items[0].validationScore, 0.91);
    assert.equal(allBody.data.items[0].imageUrl, '/api/v1/assets/test/image.png');

    const byStory = await fetch(
      `${origin}/api/v1/image-validations?storyId=${storyId}&limit=5&offset=0`,
      { headers: { authorization } }
    );
    assert.equal(byStory.status, 200);
    const byStoryBody = (await byStory.json()) as any;
    assert.equal(byStoryBody.data.items[0].storyId, storyId);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('image validations HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
