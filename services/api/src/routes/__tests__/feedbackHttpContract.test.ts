import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const parentUserId = 'g0111111-1111-4111-8111-111111111111';
const parentSessionId = 'g0222222-2222-4222-8222-222222222222';
const childSessionId = 'g0333333-3333-4333-8333-333333333333';
const childProfileId = 'g0444444-4444-4444-8444-444444444444';
const feedbackId = 'g0555555-5555-4555-8555-555555555555';

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
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const parentUser = {
    id: parentUserId,
    email: 'feedback@example.test',
    displayName: 'Feedback User',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
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
    token: 'feedback-parent-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const childSession = {
    id: childSessionId,
    userId: parentUserId,
    mode: 'child',
    parentUserId: parentUserId,
    childProfileId,
    scopes: [],
    token: 'feedback-child-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  let activeSession = parentSession;
  const createdFeedback: unknown[] = [];
  const contextUpdates: unknown[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session: activeSession, user: parentUser }),
      updateLastActive: async () => undefined,
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
    feedback: {
      create: async (input: Record<string, unknown>) => {
        createdFeedback.push(input);
        return { id: feedbackId };
      },
      findContextById: async () => ({ context: createdFeedback[0] ? (createdFeedback[0] as any).context : {} }),
      updateContext: async (id: string, context: unknown) => {
        contextUpdates.push({ id, context });
      },
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const parentAuth = `Bearer ${generateToken({ userId: parentUserId, sessionId: parentSessionId })}`;
  const childAuth = `Bearer ${generateToken({ userId: parentUserId, sessionId: childSessionId })}`;

  const post = (authorization: string | null, body: unknown) =>
    fetch(`${origin}/api/v1/feedback`, {
      method: 'POST',
      headers: {
        ...(authorization ? { authorization } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  try {
    activeSession = parentSession;
    const ok = await post(parentAuth, {
      supportTopic: 'bug',
      message: 'The story viewer froze after tapping next scene twice.',
      reportedScreen: 'story_viewer',
    });
    assert.equal(ok.status, 201, 'authenticated feedback returns 201');
    const okBody = (await ok.json()) as any;
    assert.equal(okBody.status, 'success');
    assert.equal(okBody.feedback.id, feedbackId);
    assert.equal(createdFeedback.length, 1);
    assert.equal((createdFeedback[0] as any).userId, parentUserId);
    assert.equal((createdFeedback[0] as any).category, 'bug');

    const invalid = await post(parentAuth, {
      supportTopic: 'bug',
      message: 'too short',
      reportedScreen: 'story_viewer',
    });
    assert.equal(invalid.status, 400);

    const anonMissingEmail = await post(null, {
      supportTopic: 'feature',
      message: 'Please add offline downloads for bedtime stories.',
      reportedScreen: 'library',
    });
    assert.equal(anonMissingEmail.status, 400);

    const anonOk = await post(null, {
      supportTopic: 'feature',
      message: 'Please add offline downloads for bedtime stories.',
      email: 'guest@example.test',
      reportedScreen: 'library',
    });
    assert.equal(anonOk.status, 201, 'anonymous feedback with email returns 201');
    assert.equal((createdFeedback.at(-1) as any).email, 'guest@example.test');

    activeSession = childSession;
    const childReport = await post(childAuth, {
      supportTopic: 'bug',
      message: 'Child mode should be able to submit general bug reports.',
      reportedScreen: 'story_viewer',
    });
    assert.equal(childReport.status, 201, 'child mode can report an app problem');
    assert.equal((createdFeedback.at(-1) as any).userId, parentUserId);
    assert.equal((createdFeedback.at(-1) as any).context.reportedScreen, 'story_viewer');
    assert.equal((createdFeedback.at(-1) as any).context.supportTopic, 'bug');
    assert.equal((createdFeedback.at(-1) as any).context.reporterSessionMode, 'child');
    assert.equal((createdFeedback.at(-1) as any).context.reporterChildProfileId, childProfileId);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('feedback HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
