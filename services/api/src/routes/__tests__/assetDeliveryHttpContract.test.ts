import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'c0111111-1111-4111-8111-111111111111';
const otherUserId = 'c0111111-1111-4111-8111-111111111112';
const sessionId = 'c0222222-2222-4222-8222-222222222222';

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
    email: 'asset-delivery@example.test',
    displayName: 'Asset Delivery',
    role: 'user',
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
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const publicArtifact = await fetch(`${origin}/api/v1/assets/story-artifacts/002.png`);
    assert.equal(publicArtifact.status, 200, 'public story artifact is served');
    assert.match(publicArtifact.headers.get('content-type') ?? '', /^image\/png/);
    assert.match(publicArtifact.headers.get('cache-control') ?? '', /max-age=600/);
    assert.ok((await publicArtifact.arrayBuffer()).byteLength > 0);

    const voiceSample = await fetch(
      `${origin}/api/v1/assets/voice-samples/pl/Ntd0iVwICtUtA6Fvx27M.mp3`
    );
    assert.equal(voiceSample.status, 200, 'public voice sample is served');
    assert.match(voiceSample.headers.get('content-type') ?? '', /^audio\/mpeg/);
    assert.ok((await voiceSample.arrayBuffer()).byteLength > 0);

    const turnaroundWithoutAuth = await fetch(
      `${origin}/api/v1/assets/llm_turnaround_cache/6bc2aee5-e5f6-4710-bd84-1b933b277f20.jpg`
    );
    assert.equal(turnaroundWithoutAuth.status, 401);

    const turnaround = await fetch(
      `${origin}/api/v1/assets/llm_turnaround_cache/6bc2aee5-e5f6-4710-bd84-1b933b277f20.jpg`,
      { headers: { authorization } }
    );
    assert.equal(turnaround.status, 200, 'authenticated turnaround cache image is served');
    assert.match(turnaround.headers.get('content-type') ?? '', /^image\/jpeg/);
    assert.ok((await turnaround.arrayBuffer()).byteLength > 0);

    const invalidPhotoType = await fetch(
      `${origin}/api/v1/assets/test/${userId}/photos/not-a-photo/image.jpg`,
      { headers: { authorization } }
    );
    assert.equal(invalidPhotoType.status, 400);

    const otherUsersPhoto = await fetch(
      `${origin}/api/v1/assets/test/${otherUserId}/photos/child/image.jpg`,
      { headers: { authorization } }
    );
    assert.equal(otherUsersPhoto.status, 403, 'photo ownership is enforced before file lookup');

    const missingOwnedPhoto = await fetch(
      `${origin}/api/v1/assets/test/${userId}/photos/child/missing.jpg`,
      { headers: { authorization } }
    );
    assert.equal(missingOwnedPhoto.status, 404);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('asset delivery HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
