import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'e0111111-1111-4111-8111-111111111111';
const parentSessionId = 'e0222222-2222-4222-8222-222222222221';
const childSessionId = 'e0222222-2222-4222-8222-222222222222';
const childProfileId = 'e0333333-3333-4333-8333-333333333333';

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
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.APPLE_CLIENT_ID;
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.APPLE_PRIVATE_KEY;

  const { default: app } = await import('../../index');
  const { generateToken, verifyToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'auth-session-lifecycle@example.test',
    displayName: 'Auth Session Lifecycle',
    role: 'user',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  } as any;
  const parentSession = {
    id: parentSessionId,
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
  const childSession = {
    ...parentSession,
    id: childSessionId,
    mode: 'child',
    childProfileId,
  } as any;
  let deletedAllUserId: string | null = null;
  const deletedSessionIds: string[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (requestedSessionId: string) => ({
        session: requestedSessionId === childSessionId ? childSession : parentSession,
        user,
      }),
      updateLastActive: async () => undefined,
      deleteByUserId: async (requestedUserId: string) => {
        deletedAllUserId = requestedUserId;
        return 2;
      },
      deleteByToken: async (requestedSessionId: string) => {
        deletedSessionIds.push(requestedSessionId);
      },
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

  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (
    method: string,
    path: string,
    authorization?: string,
    body?: unknown
  ) =>
    fetch(`${origin}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(authorization ? { authorization } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const googleCallbackUnavailable = await request('GET', '/api/v1/auth/google/callback');
    assert.equal(googleCallbackUnavailable.status, 404);
    const googleBody = (await googleCallbackUnavailable.json()) as any;
    assert.equal(googleBody.code, 'GOOGLE_OAUTH_NOT_CONFIGURED');

    const appleCallbackUnavailable = await request('POST', '/api/v1/auth/apple/callback', undefined, {});
    assert.equal(appleCallbackUnavailable.status, 404);

    for (const path of [
      '/api/v1/auth/parent-gate/google/start',
      '/api/v1/auth/parent-gate/apple/start',
      '/api/v1/auth/parent-gate/google-token',
      '/api/v1/auth/parent-gate/apple-token',
    ]) {
      const legacyGate = await request('POST', path, childAuthorization, {});
      assert.equal(legacyGate.status, 410, `${path} requires passcode parent gate`);
      const legacyBody = (await legacyGate.json()) as any;
      assert.equal(legacyBody.code, 'PARENT_GATE_PASSCODE_REQUIRED');
    }

    const childDeleteAll = await request('DELETE', '/api/v1/auth/sessions', childAuthorization);
    assert.equal(childDeleteAll.status, 403, 'child sessions cannot log out every parent device');

    const deleteAll = await request('DELETE', '/api/v1/auth/sessions', parentAuthorization);
    assert.equal(deleteAll.status, 200);
    const deleteAllBody = (await deleteAll.json()) as any;
    assert.equal(deleteAllBody.deletedCount, 2);
    assert.equal(deletedAllUserId, userId);

    const refreshCurrent = await request('PUT', '/api/v1/auth/sessions/current', parentAuthorization);
    assert.equal(refreshCurrent.status, 200);
    const refreshCurrentBody = (await refreshCurrent.json()) as any;
    assert.equal(verifyToken(refreshCurrentBody.token)?.sessionId, parentSessionId);

    const refreshLegacy = await request('POST', '/api/v1/auth/refresh', parentAuthorization);
    assert.equal(refreshLegacy.status, 200);
    const refreshLegacyBody = (await refreshLegacy.json()) as any;
    assert.match(refreshLegacyBody.deprecated, /PUT \/api\/v1\/auth\/sessions\/current/);

    const deleteCurrent = await request(
      'DELETE',
      '/api/v1/auth/sessions/current',
      parentAuthorization
    );
    assert.equal(deleteCurrent.status, 200);
    assert.deepEqual(deletedSessionIds, [parentSessionId]);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('auth session lifecycle HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
