import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'f0111111-1111-4111-8111-111111111111';
const sessionId = 'f0222222-2222-4222-8222-222222222222';
const storyId = 'f0333333-3333-4333-8333-333333333333';

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
  delete process.env.REDIS_URL;

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'public-alignment-languages@example.test',
    displayName: 'Public Alignment Languages',
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
  const alignment = {
    words: [
      { word: 'Once', start: 0, end: 0.4 },
      { word: 'upon', start: 0.4, end: 0.8 },
    ],
  };

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: { findById: async () => user } as any,
    story: {
      listDistinctLanguagesByUser: async (requestedUserId: string) => {
        assert.equal(requestedUserId, userId);
        return ['en', 'pl'];
      },
      findByPublishedSlug: async (slug: string) =>
        slug === 'aligned-story'
          ? { id: storyId, publishedSlug: slug, audioMetadata: null }
          : null,
    } as any,
    alignment: {
      findByStoryId: async (requestedStoryId: string) =>
        requestedStoryId === storyId ? { storyId, data: alignment } : null,
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const languagesUnauthorized = await fetch(`${origin}/api/v1/me/stories/languages`);
    assert.equal(languagesUnauthorized.status, 401);

    const languages = await fetch(`${origin}/api/v1/me/stories/languages`, {
      headers: { authorization },
    });
    assert.equal(languages.status, 200);
    const languagesBody = (await languages.json()) as any;
    assert.deepEqual(languagesBody.languages, ['en', 'pl']);

    const publicAlignment = await fetch(
      `${origin}/api/v1/public/stories/aligned-story/alignment`
    );
    assert.equal(publicAlignment.status, 200);
    assert.match(publicAlignment.headers.get('cache-control') ?? '', /max-age=86400/);
    const publicAlignmentBody = (await publicAlignment.json()) as any;
    assert.deepEqual(publicAlignmentBody.alignment, alignment);

    const missingAlignment = await fetch(
      `${origin}/api/v1/public/stories/missing-story/alignment`
    );
    assert.equal(missingAlignment.status, 404);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('public alignment and story languages HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
