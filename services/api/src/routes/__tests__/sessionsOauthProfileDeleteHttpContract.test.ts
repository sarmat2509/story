import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'k0111111-1111-4111-8111-111111111111';
const sessionId = 'k0222222-2222-4222-8222-222222222222';
const otherSessionToken = 'k-other-session-token';
const otherSessionId = 'k0333333-3333-4333-8333-333333333333';

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

  const now = new Date();
  const user = {
    id: userId,
    email: 'sessions-oauth@example.test',
    displayName: 'Sessions OAuth',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    avatarUrl: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const currentSession = {
    id: sessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    // Route compares session.token to req.sessionId for isCurrent.
    token: sessionId,
    deviceName: 'MacBook',
    deviceType: 'web',
    ipAddress: '127.0.0.1',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const otherSession = {
    id: otherSessionId,
    userId,
    mode: 'parent',
    parentUserId: userId,
    childProfileId: null,
    scopes: [],
    token: otherSessionToken,
    deviceName: 'iPhone',
    deviceType: 'ios',
    ipAddress: '10.0.0.2',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const sessions = [currentSession, otherSession];
  const deletedTokens: string[] = [];
  let userDeleted = false;
  let oauthIdentities = [
    { provider: 'google', providerEmail: 'sessions-oauth@example.test' },
    { provider: 'apple', providerEmail: 'sessions-oauth@example.test' },
  ];
  const unlinked: string[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session: currentSession, user }),
      updateLastActive: async () => undefined,
      findByUserId: async () => sessions,
      deleteByToken: async (token: string) => {
        deletedTokens.push(token);
        const idx = sessions.findIndex((row) => row.token === token || row.id === token);
        if (idx >= 0) sessions.splice(idx, 1);
      },
    } as any,
    user: {
      findById: async () => (userDeleted ? null : user),
      delete: async (id: string) => {
        assert.equal(id, userId);
        userDeleted = true;
      },
    } as any,
    oauth: {
      findProvidersByUserId: async () =>
        oauthIdentities.map((row) => ({
          provider: row.provider,
          providerEmail: row.providerEmail,
        })),
      findByUserId: async () => oauthIdentities as any,
      deleteByUserAndProvider: async (_id: string, provider: string) => {
        unlinked.push(provider);
        oauthIdentities = oauthIdentities.filter((row) => row.provider !== provider);
      },
    } as any,
    story: {
      findAllByUserId: async () => [],
    } as any,
    childProfile: {
      findAllByUserId: async () => [],
    } as any,
    character: {
      findAllByUserId: async () => [],
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

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: string, path: string) =>
    fetch(`${origin}${path}`, {
      method,
      headers: { authorization },
    });

  try {
    const listSessions = await request('GET', '/api/v1/me/sessions');
    assert.equal(listSessions.status, 200);
    const listSessionsBody = (await listSessions.json()) as any;
    assert.equal(listSessionsBody.status, 'success');
    assert.equal(listSessionsBody.sessions.length, 2);
    const current = listSessionsBody.sessions.find((row: any) => row.isCurrent);
    assert.ok(current);
    assert.equal(current.deviceName, 'MacBook');

    const revoke = await request('DELETE', `/api/v1/me/sessions/${otherSessionToken}`);
    assert.equal(revoke.status, 200);
    assert.deepEqual(deletedTokens, [otherSessionToken]);

    const providers = await request('GET', '/api/v1/me/oauth-providers');
    assert.equal(providers.status, 200);
    const providersBody = (await providers.json()) as any;
    assert.equal(providersBody.providers.length, 2);

    const linkNotImplemented = await fetch(`${origin}/api/v1/me/oauth-providers`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(linkNotImplemented.status, 501);

    oauthIdentities = [{ provider: 'google', providerEmail: 'sessions-oauth@example.test' }];
    const unlinkOnly = await request('DELETE', '/api/v1/me/oauth-providers/google');
    assert.equal(unlinkOnly.status, 400);

    oauthIdentities = [
      { provider: 'google', providerEmail: 'sessions-oauth@example.test' },
      { provider: 'apple', providerEmail: 'sessions-oauth@example.test' },
    ];
    const unlinkOk = await request('DELETE', '/api/v1/me/oauth-providers/apple');
    assert.equal(unlinkOk.status, 200);
    assert.deepEqual(unlinked, ['apple']);

    const deleteMe = await request('DELETE', '/api/v1/me');
    assert.equal(deleteMe.status, 200);
    const deleteMeBody = (await deleteMe.json()) as any;
    assert.equal(deleteMeBody.status, 'success');
    assert.equal(userDeleted, true);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('sessions/oauth/profile-delete HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
