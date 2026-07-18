import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'a0111111-1111-4111-8111-111111111111';
const sessionId = 'a0222222-2222-4222-8222-222222222222';
const planId = 'a0333333-3333-4333-8333-333333333333';
const voiceId = 'a0444444-4444-4444-8444-444444444444';

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
  process.env.ENABLE_REAL_PAYMENTS = 'true';

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'compact-auth-plans@example.test',
    displayName: 'Compact Auth Plans',
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
    token: 'compact-auth-plans-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const subscription = {
    id: 'a0555555-5555-4555-8555-555555555555',
    userId,
    planId,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    resetAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  } as any;
  const plan = {
    id: planId,
    slug: 'free',
    name: 'Free',
  } as any;

  let deletedSessionToken: string | null = null;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
      revokeById: async () => undefined,
      deleteByToken: async (token: string) => {
        deletedSessionToken = token;
      },
    } as any,
    user: {
      findById: async () => user,
      update: async (_id: string, patch: Record<string, unknown>) => {
        Object.assign(user, patch, { updatedAt: new Date() });
        return user;
      },
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
      findFeatureValue: async () => ({ enabled: false }),
      findPlanById: async (id: string) => (id === planId ? plan : null),
      findActivePlans: async () => [plan],
      findFeaturesForPlans: async () => [
        {
          planId,
          featureId: 'a0666666-6666-4666-8666-666666666666',
          slug: 'stories_per_month',
          name: 'Stories per month',
          value: { limit: 5 },
          category: 'generation',
        },
      ],
      findPlanPricesForPlanIds: async () => [
        {
          id: 'a0777777-7777-4777-8777-777777777777',
          planId,
          pricingCurrency: 'EUR',
          priceMonthly: 0,
          stripePriceId: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    } as any,
    dictionary: {
      findTranslations: async () => [],
    } as any,
    voice: {
      findActiveByLanguage: async (language: string) => [
        {
          id: voiceId,
          providerVoiceId: 'mock-voice',
          name: 'Nora',
          displayName: 'Nora',
          gender: 'female',
          description: 'Warm storyteller',
          previewUrl: null,
          sampleAudioUrl: `/api/v1/voices/samples/mock-voice.${language}.mp3`,
          isPremium: false,
          provider: 'mock',
        },
      ],
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
    const voicesOk = await request('GET', '/api/v1/voices?language=en');
    assert.equal(voicesOk.status, 200, 'GET voices returns 200');
    const voicesOkBody = (await voicesOk.json()) as any;
    assert.equal(voicesOkBody.status, 'success');
    assert.equal(voicesOkBody.data.length, 1);
    assert.equal(voicesOkBody.data[0].id, voiceId);
    assert.equal(voicesOkBody.data[0].isLocked, false);
    assert.equal(voicesOkBody.meta.userPlan, 'free');

    const upgradeBlocked = await request('PUT', '/api/v1/plans/upgrade', {
      planSlug: 'plus',
    });
    assert.equal(upgradeBlocked.status, 501, 'real payments upgrade returns 501');
    const upgradeBlockedBody = (await upgradeBlocked.json()) as any;
    assert.equal(upgradeBlockedBody.code, 'USE_STRIPE_CHECKOUT');

    const withFeatures = await request('GET', '/api/v1/plans/with-features');
    assert.equal(withFeatures.status, 200, 'plans with-features returns 200');
    const withFeaturesBody = (await withFeatures.json()) as any;
    assert.equal(withFeaturesBody.status, 'success');
    assert.equal(withFeaturesBody.plans.length, 1);
    assert.equal(withFeaturesBody.plans[0].slug, 'free');
    assert.equal(withFeaturesBody.preferredBillingCurrency, 'EUR');
    assert.equal(withFeaturesBody.billingCurrency, 'EUR');

    const currencyInvalid = await request('PUT', '/api/v1/plans/billing-currency', {
      currency: 'GBP',
    });
    assert.equal(currencyInvalid.status, 400);

    const currencyOk = await request('PUT', '/api/v1/plans/billing-currency', {
      currency: 'USD',
    });
    assert.equal(currencyOk.status, 200);
    const currencyOkBody = (await currencyOk.json()) as any;
    assert.equal(currencyOkBody.status, 'success');
    assert.equal(currencyOkBody.preferredBillingCurrency, 'USD');
    assert.equal(user.preferredBillingCurrency, 'USD');

    const logoutOk = await request('POST', '/api/v1/auth/logout');
    assert.equal(logoutOk.status, 200, 'logout returns 200');
    const logoutOkBody = (await logoutOk.json()) as any;
    assert.equal(logoutOkBody.status, 'success');
    assert.equal(deletedSessionToken, sessionId);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('compact auth/plans/voices HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
