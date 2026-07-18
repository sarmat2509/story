import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const authorId = 'r1111111-1111-4111-8111-111111111111';
const publishedStoryId = 'r2222222-2222-4222-8222-222222222221';
const publishedSlug = 'rate-limit-lantern';

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
  process.env.NODE_ENV = 'test';

  const { default: app } = await import('../../index');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const story = {
    id: publishedStoryId,
    userId: authorId,
    title: 'Rate Limit Lantern',
    language: 'en',
    isPublished: true,
    publishedSlug,
    shareToken: null,
    ratingSum: 0,
    ratingCount: 0,
    createdAt: now,
  } as any;

  let ratingCalls = 0;
  installRepositoryTestOverrides({
    story: {
      findByPublishedSlug: async (slug: string) => (slug === publishedSlug ? story : null),
      findByShareToken: async () => null,
    } as any,
    storyRating: {
      hasVotedByVoterId: async () => false,
      hasVotedByIp: async () => false,
      insertRating: async () => {
        ratingCalls += 1;
      },
      incrementStoryAggregates: async () => undefined,
    } as any,
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

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const clientIp = '203.0.113.77';

  const postRating = (voterId: string) =>
    fetch(`${origin}/api/v1/public/stories/${publishedSlug}/rating`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ rating: 5, voterId }),
    });

  try {
    for (let i = 0; i < 10; i += 1) {
      const response = await postRating(`voter-${i}`);
      assert.equal(response.status, 200, `rating ${i + 1} should succeed`);
    }

    const limited = await postRating('voter-over-limit');
    assert.equal(limited.status, 429, '11th rating from same IP returns 429');
    const limitedBody = (await limited.json()) as any;
    assert.equal(limitedBody.status, 'error');
    assert.equal(ratingCalls, 10);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('public stories rating rate-limit HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
