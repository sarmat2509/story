import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'o0111111-1111-4111-8111-111111111111';
const sessionId = 'o0222222-2222-4222-8222-222222222222';
const oauthIdentityId = 'o0333333-3333-4333-8333-333333333333';

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
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  delete process.env.CAPTCHA_REQUIRED_ACTIONS;
  // Ensure Apple/Google start return not-configured
  delete process.env.APPLE_CLIENT_ID;
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;

  const { default: app } = await import('../../index');
  const {
    clearGoogleIdTokenVerifierTestOverride,
    installGoogleIdTokenVerifierTestOverride,
  } = await import('../auth');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'oauth-mobile@example.test',
    displayName: 'OAuth Mobile',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    createdAt: now,
    updatedAt: now,
  } as any;

  const identity = {
    id: oauthIdentityId,
    userId,
    provider: 'google',
    providerUserId: 'google-sub-1',
    providerEmail: user.email,
  };

  const createdSessions: unknown[] = [];
  const tokenUpdates: unknown[] = [];

  installRepositoryTestOverrides({
    user: {
      findById: async () => user,
      findByEmail: async () => user,
    } as any,
    oauth: {
      findByProvider: async (provider: string, providerId: string) =>
        provider === 'google' && providerId === 'google-sub-1' ? identity : null,
      updateTokens: async (id: string, patch: unknown) => {
        tokenUpdates.push({ id, patch });
      },
    } as any,
    session: {
      create: async (input: Record<string, unknown>) => {
        const row = {
          id: sessionId,
          token: 'oauth-session-token',
          createdAt: now,
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          ...input,
        };
        createdSessions.push(row);
        return row;
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
  });

  installGoogleIdTokenVerifierTestOverride(async (idToken) => {
    assert.equal(idToken, 'mock-google-id-token');
    return {
      id: 'google-sub-1',
      email: user.email,
      name: 'OAuth Mobile',
      picture: undefined,
    };
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const appleStart = await fetch(`${origin}/api/v1/auth/apple/start`, { redirect: 'manual' });
    assert.equal(appleStart.status, 404, 'Apple start without config returns 404');
    const appleStartBody = (await appleStart.json()) as any;
    assert.equal(appleStartBody.code, 'APPLE_OAUTH_NOT_CONFIGURED');

    const googleStart = await fetch(`${origin}/api/v1/auth/google/start`, { redirect: 'manual' });
    assert.equal(googleStart.status, 404, 'Google start without config returns 404');
    const googleStartBody = (await googleStart.json()) as any;
    assert.equal(googleStartBody.code, 'GOOGLE_OAUTH_NOT_CONFIGURED');

    const googleMissing = await fetch(`${origin}/api/v1/auth/google/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(googleMissing.status, 400);

    const appleMissing = await fetch(`${origin}/api/v1/auth/apple/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(appleMissing.status, 404, 'Apple token without config returns 404');
    const appleMissingBody = (await appleMissing.json()) as any;
    assert.equal(appleMissingBody.code, 'APPLE_OAUTH_NOT_CONFIGURED');

    const googleOk = await fetch(`${origin}/api/v1/auth/google/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idToken: 'mock-google-id-token',
        deviceType: 'ios',
        deviceName: 'iPhone',
        termsAccepted: true,
        privacyAccepted: true,
        isAdultGuardian: true,
      }),
    });
    assert.equal(googleOk.status, 200, 'Google mobile token returns 200 for existing identity');
    const googleOkBody = (await googleOk.json()) as any;
    assert.ok(googleOkBody.token);
    assert.equal(googleOkBody.user.id, userId);
    assert.equal(googleOkBody.isNewUser, false);
    assert.equal(createdSessions.length, 1);
    assert.equal(tokenUpdates.length, 1);
  } finally {
    clearGoogleIdTokenVerifierTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('oauth entrypoints HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
