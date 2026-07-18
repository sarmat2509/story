import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const parentUserId = 'e0111111-1111-4111-8111-111111111111';
const parentSessionId = 'e0222222-2222-4222-8222-222222222222';
const planId = 'e0333333-3333-4333-8333-333333333333';
const registeredUserId = 'e0444444-4444-4444-8444-444444444444';
const loginUserId = 'e0555555-5555-4555-8555-555555555555';
const oauthOnlyUserId = 'e0666666-6666-4666-8666-666666666666';
const privacyRequestId = 'e0777777-7777-4777-8777-777777777777';
const createdSessionId = 'e0888888-8888-4888-8888-888888888888';

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
  delete process.env.CAPTCHA_REQUIRED_ACTIONS;

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { hashPassword } = await import('../../services/passwordService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const loginPassword = 'password123';
  const loginPasswordHash = await hashPassword(loginPassword);

  const parentUser = {
    id: parentUserId,
    email: 'auth-privacy@example.test',
    displayName: 'Auth Privacy',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    passwordHash: null,
    childModeExitPasscodeHash: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const parentSession = {
    id: parentSessionId,
    userId: parentUserId,
    mode: 'parent',
    parentUserId: parentUserId,
    childProfileId: null,
    scopes: [],
    token: 'auth-privacy-parent-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const loginUser = {
    id: loginUserId,
    email: 'login-user@example.test',
    displayName: 'Login User',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    passwordHash: loginPasswordHash,
    childModeExitPasscodeHash: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const oauthOnlyUser = {
    id: oauthOnlyUserId,
    email: 'oauth-only@example.test',
    displayName: 'OAuth Only',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    passwordHash: null,
    childModeExitPasscodeHash: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const usersByEmail = new Map<string, any>([
    [parentUser.email, parentUser],
    [loginUser.email, loginUser],
    [oauthOnlyUser.email, oauthOnlyUser],
  ]);
  const usersById = new Map<string, any>([
    [parentUserId, parentUser],
    [loginUserId, loginUser],
    [oauthOnlyUserId, oauthOnlyUser],
  ]);

  const subscription = {
    id: 'e0999999-9999-4999-8999-999999999999',
    userId: parentUserId,
    planId,
    status: 'active',
    trialEndsAt: null,
    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    resetAt: new Date('2026-08-01T00:00:00.000Z'),
    paymentProvider: 'stripe',
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  } as any;

  const plan = {
    id: planId,
    slug: 'free',
    name: 'Free',
  } as any;

  const privacyRequests: any[] = [];
  const recordedConsents: unknown[] = [];
  const createdSessions: any[] = [];
  const createdSubscriptions: unknown[] = [];
  let entitlementsSubscription: any = subscription;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (sessionId: string) => {
        if (sessionId === parentSessionId) return { session: parentSession, user: parentUser };
        return null;
      },
      updateLastActive: async () => undefined,
      create: async (data: any) => {
        const created = {
          id: createdSessionId,
          ...data,
          createdAt: now,
          lastActiveAt: now,
          revokedAt: null,
          expiresAt: data.expiresAt ?? new Date(now.getTime() + 60_000),
        };
        createdSessions.push(created);
        return created;
      },
    } as any,
    user: {
      findById: async (id: string) => usersById.get(id) ?? null,
      findByEmail: async (email: string) => usersByEmail.get(email.toLowerCase()) ?? null,
      create: async (data: any) => {
        const created = {
          id: registeredUserId,
          email: data.email,
          displayName: data.displayName ?? null,
          role: 'user',
          status: 'active',
          preferredLocale: data.preferredLocale ?? 'uk',
          passwordHash: data.passwordHash ?? null,
          childModeExitPasscodeHash: null,
          createdAt: now,
          updatedAt: now,
        };
        usersByEmail.set(created.email.toLowerCase(), created);
        usersById.set(created.id, created);
        return created;
      },
      update: async (id: string, patch: any) => {
        const existing = usersById.get(id);
        if (!existing) throw new Error(`user ${id} missing`);
        Object.assign(existing, patch, { updatedAt: new Date() });
        return existing;
      },
    } as any,
    userConsent: {
      record: async (row: unknown) => {
        recordedConsents.push(row);
      },
    } as any,
    dataPrivacyRequest: {
      listForUser: async (userId: string) =>
        privacyRequests.filter((row) => row.userId === userId),
      create: async (input: {
        userId: string;
        requesterEmail: string | null;
        requestType: string;
        message: string | null;
      }) => {
        const row = {
          id: privacyRequestId,
          userId: input.userId,
          requesterEmail: input.requesterEmail,
          requestType: input.requestType,
          status: 'open',
          message: input.message,
          adminNotes: null,
          reviewedByUserId: null,
          reviewedAt: null,
          fulfilledAt: null,
          createdAt: now,
          updatedAt: now,
        };
        privacyRequests.push(row);
        return row;
      },
    } as any,
    plan: {
      findSubscriptionByUserId: async (userId: string) => {
        if (userId === parentUserId) return entitlementsSubscription;
        return null;
      },
      findPlanById: async (id: string) => (id === planId ? plan : null),
      findPlanBySlug: async (slug: string) => (slug === 'free' ? plan : null),
      createSubscription: async (row: unknown) => {
        createdSubscriptions.push(row);
        return { id: 'sub-new', ...(row as object) };
      },
      findAllFeaturesForPlan: async () => [
        { slug: 'stories_per_month', value: { limit: 5 } },
        { slug: 'audio_stories_per_month', value: { limit: 2 } },
        { slug: 'characters_per_month', value: { limit: 3 } },
        { slug: 'story_from_drawing', value: { enabled: true } },
      ],
      findFeatureValue: async () => ({ enabled: true }),
      updateSubscription: async () => subscription,
    } as any,
    usageEvents: {
      getUsageForPeriod: async (
        _userId: string,
        _start: Date,
        _end: Date,
        eventType: string
      ) => (eventType === 'story_created' ? 2 : 0),
    } as any,
    bundle: {
      sumGrantBonusForPeriod: async () => ({ extraStories: 1, extraAudio: 0 }),
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
  const parentAuthorization = `Bearer ${generateToken({
    userId: parentUserId,
    sessionId: parentSessionId,
  })}`;

  const request = (
    method: string,
    path: string,
    options: { body?: unknown; authorization?: string } = {}
  ) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(options.authorization ? { authorization: options.authorization } : {}),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  try {
    // --- Register ---
    const registerMissingConsent = await request('POST', '/api/v1/auth/register', {
      body: {
        email: 'new-user@example.test',
        password: 'password123',
      },
    });
    assert.equal(registerMissingConsent.status, 400);
    const registerMissingConsentBody = (await registerMissingConsent.json()) as any;
    assert.equal(registerMissingConsentBody.code, 'CONSENT_REQUIRED');

    const registerOk = await request('POST', '/api/v1/auth/register', {
      body: {
        email: 'new-user@example.test',
        password: 'password123',
        termsAccepted: true,
        privacyAccepted: true,
        isAdultGuardian: true,
      },
    });
    assert.equal(registerOk.status, 200, 'register returns 200');
    const registerOkBody = (await registerOk.json()) as any;
    assert.equal(typeof registerOkBody.token, 'string');
    assert.equal(registerOkBody.user.id, registeredUserId);
    assert.equal(registerOkBody.user.email, 'new-user@example.test');
    assert.equal(registerOkBody.isNewUser, true);
    assert.equal(createdSessions.length >= 1, true);
    assert.equal(createdSubscriptions.length, 1);
    assert.equal(recordedConsents.length >= 3, true);

    const registerDuplicate = await request('POST', '/api/v1/auth/register', {
      body: {
        email: 'new-user@example.test',
        password: 'password123',
        termsAccepted: true,
        privacyAccepted: true,
        isAdultGuardian: true,
      },
    });
    assert.equal(registerDuplicate.status, 409);
    const registerDuplicateBody = (await registerDuplicate.json()) as any;
    assert.equal(registerDuplicateBody.code, 'EMAIL_ALREADY_REGISTERED');

    // --- Login ---
    const loginOk = await request('POST', '/api/v1/auth/sessions', {
      body: {
        email: loginUser.email,
        password: loginPassword,
      },
    });
    assert.equal(loginOk.status, 200, 'login returns 200');
    const loginOkBody = (await loginOk.json()) as any;
    assert.equal(typeof loginOkBody.token, 'string');
    assert.equal(loginOkBody.user.id, loginUserId);
    assert.equal(loginOkBody.isNewUser, false);

    const loginBadPassword = await request('POST', '/api/v1/auth/sessions', {
      body: {
        email: loginUser.email,
        password: 'wrong-password',
      },
    });
    assert.equal(loginBadPassword.status, 401);

    const loginOauthOnly = await request('POST', '/api/v1/auth/sessions', {
      body: {
        email: oauthOnlyUser.email,
        password: 'password123',
      },
    });
    assert.equal(loginOauthOnly.status, 400);
    const loginOauthOnlyBody = (await loginOauthOnly.json()) as any;
    assert.equal(loginOauthOnlyBody.code, 'OAUTH_ONLY');

    // --- Privacy requests ---
    const privacyListEmpty = await request('GET', '/api/v1/me/privacy-requests', {
      authorization: parentAuthorization,
    });
    assert.equal(privacyListEmpty.status, 200);
    const privacyListEmptyBody = (await privacyListEmpty.json()) as any;
    assert.equal(privacyListEmptyBody.status, 'success');
    assert.deepEqual(privacyListEmptyBody.data, []);

    const privacyInvalid = await request('POST', '/api/v1/me/privacy-requests', {
      authorization: parentAuthorization,
      body: { requestType: 'unknown' },
    });
    assert.equal(privacyInvalid.status, 400);

    const privacyCreate = await request('POST', '/api/v1/me/privacy-requests', {
      authorization: parentAuthorization,
      body: { requestType: 'export', message: 'Please export my data' },
    });
    assert.equal(privacyCreate.status, 201);
    const privacyCreateBody = (await privacyCreate.json()) as any;
    assert.equal(privacyCreateBody.status, 'success');
    assert.equal(privacyCreateBody.data.id, privacyRequestId);
    assert.equal(privacyCreateBody.data.requestType, 'export');
    assert.equal(privacyCreateBody.data.status, 'open');
    assert.equal(privacyCreateBody.data.message, 'Please export my data');

    const privacyList = await request('GET', '/api/v1/me/privacy-requests', {
      authorization: parentAuthorization,
    });
    assert.equal(privacyList.status, 200);
    const privacyListBody = (await privacyList.json()) as any;
    assert.equal(privacyListBody.data.length, 1);
    assert.equal(privacyListBody.data[0].id, privacyRequestId);

    // --- Entitlements ---
    const entitlementsOk = await request('GET', '/api/v1/entitlements', {
      authorization: parentAuthorization,
    });
    assert.equal(entitlementsOk.status, 200);
    const entitlementsOkBody = (await entitlementsOk.json()) as any;
    assert.equal(entitlementsOkBody.status, 'success');
    assert.equal(entitlementsOkBody.subscription.plan.slug, 'free');
    assert.equal(entitlementsOkBody.features.stories_per_month.limit, 6);
    assert.equal(entitlementsOkBody.features.stories_per_month.used, 2);
    assert.equal(entitlementsOkBody.features.stories_per_month.remaining, 4);
    assert.equal(entitlementsOkBody.features.stories_per_month.plan_limit, 5);
    assert.equal(entitlementsOkBody.features.stories_per_month.bundle_bonus, 1);
    assert.equal(entitlementsOkBody.features.story_from_drawing.enabled, true);

    entitlementsSubscription = null;
    const entitlementsMissing = await request('GET', '/api/v1/entitlements', {
      authorization: parentAuthorization,
    });
    assert.equal(entitlementsMissing.status, 404);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('auth privacy entitlements HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
