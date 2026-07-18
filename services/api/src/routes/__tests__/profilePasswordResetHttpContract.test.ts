import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'f1111111-1111-4111-8111-111111111111';
const sessionId = 'f1222222-2222-4222-8222-222222222222';
const resetUserId = 'f1333333-3333-4333-8333-333333333333';

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
  const user = {
    id: userId,
    email: 'profile-pass@example.test',
    displayName: 'Profile User',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
    passwordHash: null,
    childModeExitPasscodeHash: null as string | null,
    childModeExitPasscodeSetAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const resetUser = {
    id: resetUserId,
    email: 'reset-user@example.test',
    displayName: 'Reset User',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    passwordHash: await hashPassword('old-password'),
    childModeExitPasscodeHash: null,
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
    token: 'profile-pass-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const usersByEmail = new Map<string, any>([
    [user.email, user],
    [resetUser.email, resetUser],
  ]);
  const usersById = new Map<string, any>([
    [userId, user],
    [resetUserId, resetUser],
  ]);

  const resetTokens = new Map<string, any>();
  const createdResetTokens: string[] = [];
  const deletedResetTokens: string[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
    } as any,
    user: {
      findById: async (id: string) => usersById.get(id) ?? null,
      findByEmail: async (email: string) => usersByEmail.get(email.toLowerCase()) ?? null,
      update: async (id: string, patch: Record<string, unknown>) => {
        const existing = usersById.get(id);
        if (!existing) throw new Error(`missing user ${id}`);
        Object.assign(existing, patch, { updatedAt: new Date() });
        return existing;
      },
    } as any,
    oauth: {
      findProvidersByUserId: async () => [],
    } as any,
    passwordResetToken: {
      create: async (ownerUserId: string, expiresAt: Date) => {
        const token = `reset-token-${createdResetTokens.length + 1}`;
        const row = {
          id: `token-row-${createdResetTokens.length + 1}`,
          userId: ownerUserId,
          token,
          purpose: 'password_reset',
          metadata: {},
          expiresAt,
          createdAt: now,
        };
        resetTokens.set(token, row);
        createdResetTokens.push(token);
        return row;
      },
      findByToken: async (token: string, purpose = 'password_reset') => {
        const row = resetTokens.get(token);
        if (!row || row.purpose !== purpose) return null;
        if (row.expiresAt.getTime() <= Date.now()) return null;
        return row;
      },
      deleteByToken: async (token: string) => {
        deletedResetTokens.push(token);
        resetTokens.delete(token);
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

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

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
    const getMe = await request('GET', '/api/v1/me', { authorization });
    assert.equal(getMe.status, 200);
    const getMeBody = (await getMe.json()) as any;
    assert.equal(getMeBody.status, 'success');
    assert.equal(getMeBody.user.id, userId);
    assert.equal(getMeBody.user.displayName, 'Profile User');
    assert.equal(getMeBody.user.childModeExitPasscodeConfigured, false);
    assert.equal(getMeBody.user.passwordHash, undefined);

    const patchMe = await request('PATCH', '/api/v1/me', {
      authorization,
      body: { displayName: 'Updated Profile' },
    });
    assert.equal(patchMe.status, 200);
    const patchMeBody = (await patchMe.json()) as any;
    assert.equal(patchMeBody.user.displayName, 'Updated Profile');
    assert.equal(user.displayName, 'Updated Profile');

    const patchInvalid = await request('PATCH', '/api/v1/me', {
      authorization,
      body: { themePalette: 'not-a-palette' },
    });
    assert.equal(patchInvalid.status, 400);

    const setPasscode = await request('PATCH', '/api/v1/me/child-mode-exit-passcode', {
      authorization,
      body: { newPasscode: '1234' },
    });
    assert.equal(setPasscode.status, 200);
    const setPasscodeBody = (await setPasscode.json()) as any;
    assert.equal(setPasscodeBody.childModeExitPasscode.configured, true);
    assert.equal(typeof user.childModeExitPasscodeHash, 'string');

    const rotateMissingOld = await request('PATCH', '/api/v1/me/child-mode-exit-passcode', {
      authorization,
      body: { newPasscode: '5678' },
    });
    assert.equal(rotateMissingOld.status, 400);
    const rotateMissingOldBody = (await rotateMissingOld.json()) as any;
    assert.equal(rotateMissingOldBody.code, 'CHILD_MODE_PASSCODE_REQUIRED');

    const rotateWrongOld = await request('PATCH', '/api/v1/me/child-mode-exit-passcode', {
      authorization,
      body: { oldPasscode: '0000', newPasscode: '5678' },
    });
    assert.equal(rotateWrongOld.status, 401);
    const rotateWrongOldBody = (await rotateWrongOld.json()) as any;
    assert.equal(rotateWrongOldBody.code, 'CHILD_MODE_PASSCODE_INVALID');

    const rotateOk = await request('PATCH', '/api/v1/me/child-mode-exit-passcode', {
      authorization,
      body: { oldPasscode: '1234', newPasscode: '5678' },
    });
    assert.equal(rotateOk.status, 200);

    const forgotInvalid = await request('POST', '/api/v1/auth/forgot-password', {
      body: { email: 'not-an-email' },
    });
    assert.equal(forgotInvalid.status, 400);

    const forgotUnknown = await request('POST', '/api/v1/auth/forgot-password', {
      body: { email: 'unknown@example.test' },
    });
    assert.equal(forgotUnknown.status, 200);
    assert.equal(createdResetTokens.length, 0);

    const forgotKnown = await request('POST', '/api/v1/auth/forgot-password', {
      body: { email: resetUser.email },
    });
    assert.equal(forgotKnown.status, 200);
    assert.equal(createdResetTokens.length, 1);
    const resetToken = createdResetTokens[0];

    const resetInvalidBody = await request('POST', '/api/v1/auth/reset-password', {
      body: { token: resetToken, password: 'short' },
    });
    assert.equal(resetInvalidBody.status, 400);

    const resetBadToken = await request('POST', '/api/v1/auth/reset-password', {
      body: { token: 'missing-token', password: 'new-password-1' },
    });
    assert.equal(resetBadToken.status, 400);
    const resetBadTokenBody = (await resetBadToken.json()) as any;
    assert.equal(resetBadTokenBody.code, 'INVALID_OR_EXPIRED_TOKEN');

    const previousHash = resetUser.passwordHash;
    const resetOk = await request('POST', '/api/v1/auth/reset-password', {
      body: { token: resetToken, password: 'new-password-1' },
    });
    assert.equal(resetOk.status, 200);
    const resetOkBody = (await resetOk.json()) as any;
    assert.equal(resetOkBody.status, 'success');
    assert.notEqual(resetUser.passwordHash, previousHash);
    assert.deepEqual(deletedResetTokens, [resetToken]);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('profile password reset HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
