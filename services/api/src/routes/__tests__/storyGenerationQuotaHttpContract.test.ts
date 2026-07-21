import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import * as schema from '../../db/schema';
import {
  createScriptedTransaction,
  createTransactionRunner,
} from '../../testing/scriptedTransaction';

const userId = 'h0111111-1111-4111-8111-111111111111';
const sessionId = 'h0222222-2222-4222-8222-222222222222';
const planId = 'h0333333-3333-4333-8333-333333333333';

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
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { clearStoryJobQueueAddJobTestOverride, installStoryJobQueueAddJobTestOverride } =
    await import('../../jobs/storyJobProcessor');

  const now = new Date();
  const user = {
    id: userId,
    email: 'story-quota@example.test',
    displayName: 'Story Quota',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
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
    token: 'story-quota-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const subscription = {
    planId,
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    resetAt: new Date('2099-01-01T00:00:00.000Z'),
    paymentProvider: 'stripe',
  };
  const featureValues = new Map<string, unknown>([
    ['images_per_story', { limit: 4 }],
    ['stories_per_month', { limit: 3 }],
    ['graphic_novels_per_month', { limit: 1 }],
    ['mixed_stories_per_month', { limit: 0 }],
  ]);

  const exceededStoryQuotaTx = createScriptedTransaction({
    selects: [
      { label: 'story subscription', table: schema.userSubscriptions, rows: [subscription] },
      {
        label: 'story plan limit',
        table: schema.planFeatures,
        rows: [{ value: { limit: 3 } }],
      },
      {
        label: 'story bundle bonus',
        table: schema.userBundleGrants,
        rows: [{ extraStories: 0 }],
      },
      { label: 'story current usage', table: schema.usageEvents, rows: [{ total: 3 }] },
    ],
  });
  const noSubscriptionTx = createScriptedTransaction({
    selects: [{ label: 'missing subscription', table: schema.userSubscriptions, rows: [] }],
  });
  const quotaRunner = createTransactionRunner([exceededStoryQuotaTx, noSubscriptionTx]);

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: {
      findById: async () => user,
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
    plan: {
      findSubscriptionByUserId: async () => subscription,
      findAllFeaturesForPlan: async () =>
        Array.from(featureValues, ([slug, value]) => ({ slug, value })),
      findFeatureValue: async (_planId: string, slug: string) => featureValues.get(slug) ?? null,
    } as any,
    story: {
      countActiveRequestsForUpdate: async () => 0,
      transaction: quotaRunner.transaction,
      updateRequest: async () => undefined,
      findByIdAndUser: async () => null,
    } as any,
    usageEvents: {
      create: async () => ({ id: 'usage-unused' }),
      getUsageForPeriod: async () => 1,
    } as any,
    bundle: {
      sumGrantBonusForPeriod: async () => ({ extraStories: 0, extraAudio: 0 }),
    } as any,
  });

  installStoryJobQueueAddJobTestOverride(async () => {
    throw new Error('create must fail before queue enqueue when quota is exhausted');
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const token = generateToken({ userId, sessionId });
  const validStoryInput = {
    ui_locale: 'en',
    story_language: 'en',
    goal: 'kindness',
    scenario_card_id: 'forest_path',
    image_style: 'soft_watercolor',
    user_notes: 'A calm lantern adventure.',
    selected_characters: [],
    selected_children: [],
  };

  const post = (path: string) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(validStoryInput),
    });

  try {
    const graphicExceeded = await post('/api/v1/graphic-novels');
    assert.equal(graphicExceeded.status, 403, 'graphic novel format quota returns 403');
    const graphicBody = (await graphicExceeded.json()) as any;
    assert.equal(graphicBody.code, 'GRAPHIC_NOVEL_LIMIT_REACHED');
    assert.equal(graphicBody.featureSlug, 'graphic_novels_per_month');

    // Comic-to-text is available on the same plans as comics. Simulate a
    // plan without comic access before checking that both formats are gated.
    featureValues.set('graphic_novels_per_month', { limit: 0 });
    const mixedBlocked = await post('/api/v1/mixed-stories');
    assert.equal(mixedBlocked.status, 403, 'mixed story unavailable on plan returns 403');
    const mixedBody = (await mixedBlocked.json()) as any;
    assert.equal(mixedBody.code, 'MIXED_STORY_NOT_AVAILABLE');
    assert.equal(mixedBody.featureSlug, 'mixed_stories_per_month');

    const exceeded = await post('/api/v1/stories');
    assert.equal(exceeded.status, 429, 'exhausted monthly story quota returns 429');
    const exceededBody = (await exceeded.json()) as any;
    assert.equal(exceededBody.code, 'STORY_LIMIT_EXCEEDED');
    assert.equal(exceededBody.featureSlug, 'stories_per_month');

    const noSub = await post('/api/v1/stories');
    assert.equal(noSub.status, 403, 'missing subscription returns 403');
    const noSubBody = (await noSub.json()) as any;
    assert.equal(noSubBody.code, 'NO_SUBSCRIPTION');

    quotaRunner.assertExhausted();
  } finally {
    clearStoryJobQueueAddJobTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('story generation quota HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
