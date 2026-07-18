import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { MockTextProvider, mockStoryQuizPayload } from '../../testing/ai';

const userId = 'c0111111-1111-4111-8111-111111111111';
const sessionId = 'c0222222-2222-4222-8222-222222222222';
const storyId = 'c0333333-3333-4333-8333-333333333333';
const quizId = 'c0444444-4444-4444-8444-444444444444';

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
  const {
    clearAiServiceTestOverrides,
    installAiServiceTestOverrides,
  } = await import('../../services/aiService');

  const now = new Date();
  const user = {
    id: userId,
    email: 'quiz-generate@example.test',
    displayName: 'Quiz Generate',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
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
    token: 'quiz-generate-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const story = {
    id: storyId,
    userId,
    childProfileId: null,
    createdByChildProfileId: null,
    storyRequestId: null,
    title: 'The Quiet Lantern Trail',
    language: 'en',
    ageGroup: '6-8',
    fullText: 'Mira found a lantern beside the quiet path and shared its light with Leo.',
    scenes: [
      { sceneId: 1, text: 'Mira found a lantern beside the quiet path.' },
      { sceneId: 2, text: 'Leo shared the light with friends at the trail end.' },
    ],
    closingKeepsakeLabel: null,
    createdAt: now,
  } as any;

  const quizPayload = mockStoryQuizPayload();
  let quizMode: 'cache' | 'generating' | 'force' = 'cache';
  const upsertCalls: unknown[] = [];
  const markCompletedCalls: unknown[] = [];
  let findByKeyCalls = 0;

  function completedQuiz(key: Record<string, unknown> = {}) {
    return {
      id: quizId,
      storyId,
      userId,
      childProfileId: null,
      language: 'en',
      sourceAgeGroup: '6-8',
      quizAgeBucket: '6-8',
      promptVersion: 'quiz-v22',
      sourceFingerprint: 'fp',
      status: 'completed',
      payload: quizPayload,
      generationTimeMs: 12,
      createdAt: now,
      updatedAt: now,
      ...key,
    };
  }

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
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
    story: {
      findByIdAndUser: async (id: string, ownerId: string) =>
        id === storyId && ownerId === userId ? story : null,
      findRequestById: async () => null,
      findLinkedCharactersByStoryId: async () => [{ name: 'Mira' }],
    } as any,
    scene: {
      findByStoryId: async () => [
        { sceneId: 1, text: 'Mira found a lantern beside the quiet path.' },
        { sceneId: 2, text: 'Leo shared the light with friends at the trail end.' },
      ],
    } as any,
    childProfile: {
      findByIds: async () => [],
    } as any,
    storyQuiz: {
      findByKey: async (key: Record<string, unknown>) => {
        findByKeyCalls += 1;
        if (quizMode === 'cache') {
          return completedQuiz(key);
        }
        if (quizMode === 'generating') {
          return {
            ...completedQuiz(key),
            status: 'generating',
            payload: null,
            updatedAt: new Date(),
          };
        }
        // force: first call returns completed cache, later calls can return null/generating row
        if (findByKeyCalls === 1) {
          return completedQuiz(key);
        }
        return null;
      },
      upsertGenerating: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return {
          id: quizId,
          ...input,
          status: 'generating',
          payload: null,
          createdAt: now,
          updatedAt: now,
        };
      },
      markCompleted: async (id: string, payload: unknown, generationTimeMs: number) => {
        markCompletedCalls.push({ id, payload, generationTimeMs });
        return completedQuiz({ payload, generationTimeMs });
      },
      markFailed: async () => undefined,
    } as any,
    storyQuizProgress: {
      findByOwner: async () => null,
    } as any,
    usageEvents: {
      create: async () => ({ id: 'usage-quiz-1' }),
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const post = (body: unknown) =>
    fetch(`${origin}/api/v1/me/stories/${storyId}/quiz`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  try {
    quizMode = 'cache';
    findByKeyCalls = 0;
    const cached = await post({});
    assert.equal(cached.status, 200, 'cached quiz returns 200 without LLM');
    const cachedBody = (await cached.json()) as any;
    assert.equal(cachedBody.status, 'success');
    assert.equal(cachedBody.quiz.id, quizId);
    assert.equal(cachedBody.quiz.payload.title, quizPayload.title);
    assert.equal(upsertCalls.length, 0);
    assert.equal(markCompletedCalls.length, 0);

    quizMode = 'generating';
    findByKeyCalls = 0;
    const inProgress = await post({});
    assert.equal(inProgress.status, 409);
    const inProgressBody = (await inProgress.json()) as any;
    assert.equal(inProgressBody.code, 'QUIZ_GENERATION_IN_PROGRESS');

    quizMode = 'force';
    findByKeyCalls = 0;
    upsertCalls.length = 0;
    markCompletedCalls.length = 0;
    const provider = new MockTextProvider().queueStructured(
      'text_quiz_generate',
      mockStoryQuizPayload()
    );
    installAiServiceTestOverrides({ textProvider: provider });
    try {
      const forced = await post({ force: true });
      assert.equal(forced.status, 200, 'force regenerate returns 200');
      const forcedBody = (await forced.json()) as any;
      assert.equal(forcedBody.status, 'success');
      assert.equal(forcedBody.quiz.payload.activities.length, 9);
      assert.equal(upsertCalls.length, 1);
      assert.equal(markCompletedCalls.length, 1);
      provider.assertExhausted();
    } finally {
      clearAiServiceTestOverrides();
    }

    const missing = await fetch(
      `${origin}/api/v1/me/stories/c9999999-9999-4999-8999-999999999999/quiz`,
      {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: '{}',
      }
    );
    assert.equal(missing.status, 404);
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('quiz generate HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
