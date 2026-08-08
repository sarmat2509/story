import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'f0111111-1111-4111-8111-111111111111';
const sessionId = 'f0222222-2222-4222-8222-222222222222';
const planId = 'f0333333-3333-4333-8333-333333333333';
const plusPlanId = 'f0444444-4444-4444-8444-444444444444';
const discountCodeId = 'f0555555-5555-4555-8555-555555555555';
const bundleId = 'f0666666-6666-4666-8666-666666666666';

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
  delete process.env.ENABLE_REAL_PAYMENTS;
  delete process.env.CAPTCHA_REQUIRED_ACTIONS;

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'billing-bundles@example.test',
    displayName: 'Billing Bundles',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    preferredBillingCurrency: 'EUR',
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
    token: 'billing-bundles-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  let subscription: any = {
    id: 'f0777777-7777-4777-8777-777777777777',
    userId,
    planId,
    status: 'active',
    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    resetAt: new Date('2026-08-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    paymentProvider: 'stripe',
    stripeSubscriptionId: null,
    createdAt: now,
    updatedAt: now,
  };
  let storyMixEnabled = false;
  let storyMixUsage = {
    points: 35_480,
    stories: 2,
    graphicNovels: 4,
    mixedStories: 0,
  };

  const freePlan = { id: planId, slug: 'free', name: 'Free' } as any;
  const plusPlan = { id: plusPlanId, slug: 'plus', name: 'Plus' } as any;

  const discountCode = {
    id: discountCodeId,
    code: 'WT-SAVE-PLUS',
    kind: 'subscription',
    percentOff: 20,
    durationMonths: 3,
    planId: plusPlanId,
    bundleId: null,
    isActive: true,
  } as any;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: {
      findById: async (id: string) => (id === userId ? user : null),
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
      findPlanById: async (id: string) => {
        if (id === planId) return freePlan;
        if (id === plusPlanId) return plusPlan;
        return null;
      },
      findPlanBySlug: async (slug: string) => {
        if (slug === 'free') return freePlan;
        if (slug === 'plus') return plusPlan;
        return null;
      },
      findPlanPrice: async (id: string, currency: string) =>
        id === plusPlanId
          ? {
              planId: plusPlanId,
              pricingCurrency: currency,
              priceMonthly: 999,
              stripePriceId: 'price_plus',
            }
          : null,
      findAllFeaturesForPlan: async () =>
        storyMixEnabled
          ? [
              { slug: 'stories_per_month', value: { limit: 100 } },
              { slug: 'audio_stories_per_month', value: { limit: 2 } },
              { slug: 'graphic_novels_per_month', value: { limit: 11 } },
              { slug: 'mixed_stories_per_month', value: { limit: 19 } },
              { slug: 'story_mix_budget_points', value: { limit: 100_000 } },
              { slug: 'images_per_story', value: { limit: 3 } },
              { slug: 'characters_per_month', value: { limit: 3 } },
            ]
          : [
              { slug: 'stories_per_month', value: { limit: 5 } },
              { slug: 'audio_stories_per_month', value: { limit: 2 } },
              { slug: 'graphic_novels_per_month', value: { limit: 1 } },
              { slug: 'mixed_stories_per_month', value: { limit: 0 } },
              { slug: 'images_per_story', value: { limit: 3 } },
              { slug: 'characters_per_month', value: { limit: 3 } },
            ],
      findFeatureValue: async () => ({ enabled: true }),
      updateSubscription: async (_userId: string, update: Record<string, unknown>) => {
        subscription = { ...subscription, ...update };
        return subscription;
      },
    } as any,
    usageEvents: {
      getUsageForPeriod: async (
        _userId: string,
        _start: Date,
        _end: Date,
        eventType: string
      ) => {
        if (eventType === 'story_created') return 2;
        if (eventType === 'audio_synthesized') return 1;
        if (eventType === 'graphic_novel_created') return 0;
        return 0;
      },
      getStoryMixUsageForPeriod: async () => storyMixUsage,
    } as any,
    bundle: {
      sumGrantBonusForPeriod: async () => ({ extraStories: 1, extraAudio: 0 }),
      listBundlesWithPricesForPlan: async () => [
        {
          bundle: {
            id: bundleId,
            slug: 'starter-pack',
            name: 'Starter Pack',
            extraStories: 5,
            extraAudio: 2,
            sortOrder: 1,
            isActive: true,
          },
          price: {
            priceMinor: 499,
            pricingCurrency: 'EUR',
            stripePriceId: null,
          },
        },
      ],
      findBundleBySlug: async () => null,
      findPriceForPlanAndBundle: async () => null,
    } as any,
    discount: {
      findCodeByValue: async (code: string) =>
        code === 'WT-SAVE-PLUS' ? discountCode : null,
      assignmentCount: async () => 0,
      isCodeAssignedToUser: async () => true,
      findActiveSubscriptionApplication: async () => null,
      cancelApplication: async () => undefined,
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: string, path: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const usageOk = await request('GET', '/api/v1/me/subscription-usage');
    assert.equal(usageOk.status, 200);
    const usageOkBody = (await usageOk.json()) as any;
    assert.equal(usageOkBody.status, 'success');
    assert.equal(usageOkBody.data.stories.used, 2);
    assert.equal(usageOkBody.data.stories.plan_limit, 5);
    assert.equal(usageOkBody.data.stories.bundle_bonus, 1);
    assert.equal(usageOkBody.data.stories.limit, 6);
    assert.equal(usageOkBody.data.stories.remaining, 4);
    assert.equal(usageOkBody.data.audio.used, 1);
    assert.equal(usageOkBody.data.audio.limit, 2);
    assert.equal(usageOkBody.data.subscriptionStatus, 'active');
    assert.equal(usageOkBody.data.enableRealPayments, false);

    storyMixEnabled = true;
    storyMixUsage = {
      points: 0,
      stories: 0,
      graphicNovels: 0,
      mixedStories: 0,
    };
    const defaultStoryMix = await request('GET', '/api/v1/me/subscription-usage');
    assert.equal(defaultStoryMix.status, 200);
    const defaultStoryMixBody = (await defaultStoryMix.json()) as any;
    assert.deepEqual(defaultStoryMixBody.data.storyMix.allocation, {
      stories: 87,
      graphicNovels: 1,
      mixedStories: 1,
    });

    storyMixUsage = {
      points: 35_480,
      stories: 2,
      graphicNovels: 4,
      mixedStories: 0,
    };
    subscription = {
      ...subscription,
      metadata: {
        storyMix: {
          graphicNovels: 4,
          mixedStories: 0,
          periodStart: subscription.currentPeriodStart.toISOString(),
        },
      },
    };
    const storyMixOk = await request('GET', '/api/v1/me/subscription-usage');
    assert.equal(storyMixOk.status, 200);
    const storyMixOkBody = (await storyMixOk.json()) as any;
    assert.deepEqual(storyMixOkBody.data.stories, {
      used: 2,
      limit: 67,
      remaining: 65,
      plan_limit: 100,
      bundle_bonus: 1,
    });
    assert.deepEqual(storyMixOkBody.data.graphicNovels, {
      used: 4,
      limit: 4,
      remaining: 0,
      plan_limit: 11,
      bundle_bonus: 0,
    });
    assert.deepEqual(storyMixOkBody.data.mixedStories, {
      used: 0,
      limit: 0,
      remaining: 0,
      plan_limit: 19,
      bundle_bonus: 1,
    });
    assert.deepEqual(storyMixOkBody.data.storyMix.allocation, {
      stories: 67,
      graphicNovels: 4,
      mixedStories: 0,
    });

    const invalidStoryMix = await request('PUT', '/api/v1/me/story-mix', {
      graphicNovels: 3,
      mixedStories: 0,
    });
    assert.equal(invalidStoryMix.status, 409);
    assert.equal((await invalidStoryMix.json() as any).code, 'STORY_MIX_EXCEEDS_BUDGET');

    const savedStoryMix = await request('PUT', '/api/v1/me/story-mix', {
      graphicNovels: 4,
      mixedStories: 1,
    });
    assert.equal(savedStoryMix.status, 200);
    const storyMixAfterSave = await request('GET', '/api/v1/me/subscription-usage');
    const storyMixAfterSaveBody = (await storyMixAfterSave.json()) as any;
    assert.deepEqual(storyMixAfterSaveBody.data.stories, {
      used: 2,
      limit: 62,
      remaining: 60,
      plan_limit: 100,
      bundle_bonus: 1,
    });
    assert.deepEqual(storyMixAfterSaveBody.data.mixedStories, {
      used: 0,
      limit: 1,
      remaining: 1,
      plan_limit: 19,
      bundle_bonus: 1,
    });

    subscription = null;
    const usageMissing = await request('GET', '/api/v1/me/subscription-usage');
    assert.equal(usageMissing.status, 403);
    const usageMissingBody = (await usageMissing.json()) as any;
    assert.equal(usageMissingBody.code, 'NO_SUBSCRIPTION');
    subscription = {
      id: 'f0777777-7777-4777-8777-777777777777',
      userId,
      planId,
      status: 'active',
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      resetAt: new Date('2026-08-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      stripeSubscriptionId: null,
      createdAt: now,
      updatedAt: now,
    };

    const bundlesOk = await request('GET', '/api/v1/bundles');
    assert.equal(bundlesOk.status, 200);
    const bundlesOkBody = (await bundlesOk.json()) as any;
    assert.equal(bundlesOkBody.status, 'success');
    assert.equal(bundlesOkBody.bundles.length, 1);
    assert.equal(bundlesOkBody.bundles[0].slug, 'starter-pack');
    assert.equal(bundlesOkBody.bundles[0].priceMinor, 499);
    assert.equal(bundlesOkBody.bundles[0].pricingCurrency, 'EUR');
    assert.equal(bundlesOkBody.bundles[0].stripePriceConfigured, false);

    subscription = null;
    const bundlesEmpty = await request('GET', '/api/v1/bundles');
    assert.equal(bundlesEmpty.status, 200);
    const bundlesEmptyBody = (await bundlesEmpty.json()) as any;
    assert.deepEqual(bundlesEmptyBody.bundles, []);
    subscription = {
      id: 'f0777777-7777-4777-8777-777777777777',
      userId,
      planId,
      status: 'active',
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      resetAt: new Date('2026-08-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      stripeSubscriptionId: null,
      createdAt: now,
      updatedAt: now,
    };

    for (const [path, body] of [
      ['/api/v1/billing/checkout-session', { planSlug: 'plus' }],
      ['/api/v1/billing/bundle-checkout', { bundleSlug: 'starter-pack' }],
      ['/api/v1/billing/portal-session', {}],
    ] as const) {
      const blocked = await request('POST', path, body);
      assert.equal(blocked.status, 501, `${path} returns 501 when payments disabled`);
      const blockedBody = (await blocked.json()) as any;
      assert.equal(blockedBody.code, 'REAL_PAYMENTS_DISABLED');
    }

    const discountInvalid = await request('POST', '/api/v1/billing/discount-preview', {
      kind: 'subscription',
    });
    assert.equal(discountInvalid.status, 400);
    const discountInvalidBody = (await discountInvalid.json()) as any;
    assert.equal(discountInvalidBody.code, 'INVALID_DISCOUNT_PREVIEW');

    const discountMissing = await request('POST', '/api/v1/billing/discount-preview', {
      code: 'NOPE',
      kind: 'subscription',
      planSlug: 'plus',
    });
    assert.equal(discountMissing.status, 400);
    const discountMissingBody = (await discountMissing.json()) as any;
    assert.equal(discountMissingBody.code, 'CODE_UNAVAILABLE');

    const discountOk = await request('POST', '/api/v1/billing/discount-preview', {
      code: 'wt-save-plus',
      kind: 'subscription',
      planSlug: 'plus',
      currency: 'EUR',
    });
    assert.equal(discountOk.status, 200);
    const discountOkBody = (await discountOk.json()) as any;
    assert.equal(discountOkBody.status, 'success');
    assert.equal(discountOkBody.data.code, 'WT-SAVE-PLUS');
    assert.equal(discountOkBody.data.percentOff, 20);
    assert.equal(discountOkBody.data.originalAmountMinor, 999);
    assert.equal(discountOkBody.data.discountAmountMinor, 200);
    assert.equal(discountOkBody.data.finalAmountMinor, 799);
    assert.equal(discountOkBody.data.pricingCurrency, 'EUR');
    assert.equal(typeof discountOkBody.data.quoteFingerprint, 'string');
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('billing bundles usage HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
