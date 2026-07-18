import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const parentUserId = 'i0111111-1111-4111-8111-111111111111';
const childSessionId = 'i0222222-2222-4222-8222-222222222222';
const parentSessionId = 'i0333333-3333-4333-8333-333333333333';
const childProfileId = 'i0444444-4444-4444-8444-444444444444';
const recoveryCompleteSessionId = 'i0555555-5555-4555-8555-555555555555';

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
  delete process.env.RESEND_API_KEY;

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { hashPassword, verifyPassword } = await import('../../services/passwordService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const passcode = '1234';
  const passcodeHash = await hashPassword(passcode);

  const parentUser = {
    id: parentUserId,
    email: 'parent-gate@example.test',
    displayName: 'Parent Gate',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    childModeExitPasscodeHash: passcodeHash,
    createdAt: now,
    updatedAt: now,
  } as any;

  const childSession = {
    id: childSessionId,
    userId: parentUserId,
    mode: 'child',
    parentUserId: parentUserId,
    childProfileId,
    scopes: ['story:read', 'story:create_instant'],
    token: 'child-gate-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const childProfile = {
    id: childProfileId,
    userId: parentUserId,
    name: 'Mira',
    birthYear: 2018,
    childModeEnabled: true,
    createdAt: now,
    updatedAt: now,
  } as any;

  const createdSessions: any[] = [];
  const deletedByToken: string[] = [];
  const recoveryTokens = new Map<string, any>();
  let activeAuthSession = childSession;

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (id: string) => {
        if (id === activeAuthSession.id) {
          return { session: activeAuthSession, user: parentUser };
        }
        const created = createdSessions.find((row) => row.id === id);
        if (created) return { session: created, user: parentUser };
        return null;
      },
      updateLastActive: async () => undefined,
      create: async (input: Record<string, unknown>) => {
        const row = {
          id: createdSessions.length === 0 ? parentSessionId : recoveryCompleteSessionId,
          token: `created-token-${createdSessions.length + 1}`,
          createdAt: now,
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          scopes: [],
          childProfileId: null,
          ...input,
        };
        createdSessions.push(row);
        return row;
      },
      deleteByToken: async (tokenOrId: string) => {
        deletedByToken.push(tokenOrId);
      },
    } as any,
    user: {
      findById: async () => parentUser,
      update: async (_id: string, patch: Record<string, unknown>) => {
        Object.assign(parentUser, patch, { updatedAt: new Date() });
        return parentUser;
      },
    } as any,
    childProfile: {
      findById: async (id: string) => (id === childProfileId ? childProfile : null),
      findByUserIdAndId: async (ownerId: string, id: string) =>
        ownerId === parentUserId && id === childProfileId ? childProfile : null,
    } as any,
    passwordResetToken: {
      create: async (
        ownerUserId: string,
        expiresAt: Date,
        options?: { purpose?: string; metadata?: Record<string, unknown> }
      ) => {
        const token = `recovery-token-${recoveryTokens.size + 1}`;
        const row = {
          id: `recovery-row-${recoveryTokens.size + 1}`,
          userId: ownerUserId,
          token,
          purpose: options?.purpose ?? 'password_reset',
          metadata: options?.metadata ?? {},
          expiresAt,
          createdAt: now,
        };
        recoveryTokens.set(token, row);
        return row;
      },
      findByToken: async (token: string, purpose = 'password_reset') => {
        const row = recoveryTokens.get(token);
        if (!row || row.purpose !== purpose) return null;
        if (row.expiresAt.getTime() <= Date.now()) return null;
        return row;
      },
      deleteByToken: async (token: string) => {
        recoveryTokens.delete(token);
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

  const childAuth = `Bearer ${generateToken({ userId: parentUserId, sessionId: childSessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: 'POST' | 'PATCH', path: string, body: unknown, authorization?: string) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(authorization ? { authorization } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const post = (path: string, body: unknown, authorization?: string) =>
    request('POST', path, body, authorization);

  try {
    activeAuthSession = childSession;

    const invalidGate = await post('/api/v1/auth/parent-gate', {}, childAuth);
    assert.equal(invalidGate.status, 400);

    const wrongPasscode = await post('/api/v1/auth/parent-gate', { password: '9999' }, childAuth);
    assert.equal(wrongPasscode.status, 401);
    const wrongBody = (await wrongPasscode.json()) as any;
    assert.equal(wrongBody.code, 'CHILD_MODE_PASSCODE_INVALID');

    const legacyGate = await post('/api/v1/auth/parent-gate/google/start', {}, childAuth);
    assert.equal(legacyGate.status, 410);
    const legacyBody = (await legacyGate.json()) as any;
    assert.equal(legacyBody.code, 'PARENT_GATE_PASSCODE_REQUIRED');

    const gateOk = await post('/api/v1/auth/parent-gate', { password: passcode }, childAuth);
    assert.equal(gateOk.status, 200, 'valid passcode returns parent session');
    const gateOkBody = (await gateOk.json()) as any;
    assert.equal(gateOkBody.sessionMode, 'parent');
    assert.ok(gateOkBody.token);
    assert.equal(gateOkBody.user.id, parentUserId);
    assert.equal(createdSessions.length, 1);
    assert.equal(createdSessions[0].mode, 'parent');
    assert.ok(deletedByToken.includes(childSessionId));

    activeAuthSession = createdSessions[0];
    const parentAuth = `Bearer ${generateToken({
      userId: parentUserId,
      sessionId: parentSessionId,
    })}`;
    const profileRecoveryRequest = await post('/api/v1/auth/child-mode/recovery', {}, parentAuth);
    assert.equal(profileRecoveryRequest.status, 200);
    assert.equal(recoveryTokens.size, 1);
    assert.equal([...recoveryTokens.values()][0].metadata.requestedFrom, 'parent_profile');
    recoveryTokens.clear();

    activeAuthSession = childSession;
    const recoveryRequest = await post('/api/v1/auth/child-mode/recovery', {}, childAuth);
    assert.equal(recoveryRequest.status, 200);
    assert.equal(recoveryTokens.size, 1);
    const recoveryToken = [...recoveryTokens.keys()][0];

    const recoveryInvalid = await post('/api/v1/auth/child-mode/recovery/complete', {
      token: 'not-a-real-token',
    });
    assert.equal(recoveryInvalid.status, 400);
    const recoveryInvalidBody = (await recoveryInvalid.json()) as any;
    assert.equal(recoveryInvalidBody.code, 'CHILD_MODE_RECOVERY_INVALID');

    const recoveryComplete = await post('/api/v1/auth/child-mode/recovery/complete', {
      token: recoveryToken,
    });
    assert.equal(recoveryComplete.status, 200);
    const recoveryCompleteBody = (await recoveryComplete.json()) as any;
    assert.equal(recoveryCompleteBody.sessionMode, 'parent');
    assert.ok(recoveryCompleteBody.token);
    assert.equal(createdSessions.length, 2);
    assert.equal(recoveryTokens.size, 1);
    const resetToken = recoveryCompleteBody.childModeExitPasscodeResetToken;
    assert.equal(typeof resetToken, 'string');
    assert.equal(recoveryTokens.get(resetToken)?.purpose, 'child_mode_passcode_reset');
    assert.ok(deletedByToken.includes(childSessionId));

    activeAuthSession = createdSessions[1];
    const recoveredParentAuth = `Bearer ${generateToken({
      userId: parentUserId,
      sessionId: recoveryCompleteSessionId,
    })}`;
    const resetPasscode = await request(
      'PATCH',
      '/api/v1/me/child-mode-exit-passcode',
      { recoveryToken: resetToken, newPasscode: 'reset-5678' },
      recoveredParentAuth
    );
    assert.equal(resetPasscode.status, 200);
    assert.equal(recoveryTokens.size, 0, 'reset grant is single-use');
    assert.equal(await verifyPassword('reset-5678', parentUser.childModeExitPasscodeHash), true);

    const reusedResetToken = await request(
      'PATCH',
      '/api/v1/me/child-mode-exit-passcode',
      { recoveryToken: resetToken, newPasscode: 'reset-again' },
      recoveredParentAuth
    );
    assert.equal(reusedResetToken.status, 400);
    const reusedResetTokenBody = (await reusedResetToken.json()) as any;
    assert.equal(reusedResetTokenBody.code, 'CHILD_MODE_PASSCODE_RECOVERY_INVALID');
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('parent gate / recovery HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
