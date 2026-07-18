import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

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
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  installRepositoryTestOverrides({
    story: {
      listPublished: async () => [],
      countPublished: async () => 0,
      findByPublishedSlug: async () => null,
      findByShareToken: async () => null,
    } as any,
    user: {
      findPublicAuthorsByIds: async () => [],
      findPublicAuthorById: async () => null,
    } as any,
    childProfile: {
      findPublicChildAuthorsByIds: async () => [],
      findPublicChildAuthorById: async () => null,
    } as any,
    asset: { findByIds: async () => [] } as any,
    plan: { findActivePlans: async () => [] } as any,
    voice: { findActiveByLanguage: async () => [] } as any,
    appRelease: {
      listPublished: async () => [],
      latestPublishedModifiedAt: async () => null,
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const htmlPaths = [
      '/ssr/stories',
      '/ssr/stories/catalog/pl',
      '/ssr/landing',
      '/ssr/landing/pl',
      '/ssr/pricing',
      '/ssr/pricing/es?currency=USD',
      '/ssr/legal/terms',
      '/ssr/legal/terms/uk',
      '/ssr/legal/privacy',
      '/ssr/legal/privacy/de',
      '/ssr/support',
      '/ssr/support/fr',
      '/ssr/blog',
      '/ssr/blog/index/pl',
      '/ssr/blog/ten-year-old-reading-comprehension',
      '/ssr/blog/es/ten-year-old-reading-comprehension',
      '/ssr/updates',
      '/ssr/updates/pl',
    ];

    for (const path of htmlPaths) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200, `${path} renders HTML`);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
      const html = await response.text();
      assert.match(html, /<!doctype html>/i, `${path} returns a document`);
    }

    const etagSource = await fetch(`${origin}/ssr/blog`);
    const etag = etagSource.headers.get('etag');
    await etagSource.text();
    assert.ok(etag, 'blog response exposes an ETag');
    const notModified = await fetch(`${origin}/ssr/blog`, {
      headers: { 'if-none-match': etag! },
    });
    assert.equal(notModified.status, 304);

    const sitemap = await fetch(`${origin}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get('content-type') ?? '', /^application\/xml/);
    assert.match(await sitemap.text(), /<urlset/);

    const missingPaths = [
      '/ssr/stories/not-published',
      '/ssr/u/not-a-share-token',
      '/ssr/authors/not-a-uuid',
      '/ssr/blog/missing-article',
      '/ssr/blog/pl/missing-article',
      '/share-card/not-published',
      '/share-card/u/not-a-share-token',
    ];
    for (const path of missingPaths) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 404, `${path} hides missing/private content`);
      await response.arrayBuffer();
    }
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('SSR, sitemap, and share-card HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
