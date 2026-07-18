import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'b1111111-1111-4111-8111-111111111111';
const sessionId = 'b2222222-2222-4222-8222-222222222222';
const quizReadyStoryId = 'b3333333-3333-4333-8333-333333333331';
const quizMissingStoryId = 'b3333333-3333-4333-8333-333333333332';
const quizId = 'b4444444-4444-4444-8444-444444444444';

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

  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const { mockStoryQuizPayload } = await import('../../testing/ai/fixtures');

  const now = new Date();
  const user = {
    id: userId,
    email: 'quiz-read-contract@example.test',
    displayName: 'Quiz Read Contract',
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
    token: 'quiz-read-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  function makeStory(id: string) {
    return {
      id,
      userId,
      childProfileId: null,
      createdByChildProfileId: null,
      storyRequestId: null,
      title: 'The Quiet Lantern Trail',
      language: 'en',
      ageGroup: '6-8',
      fullText: 'Mira found a lantern beside the quiet path and shared its light with Leo.',
      scenes: [{ sceneId: 1, text: 'Mira found a lantern beside the quiet path.' }],
      closingKeepsakeLabel: null,
      createdAt: now,
    } as any;
  }

  const quizReadyStory = makeStory(quizReadyStoryId);
  const quizMissingStory = makeStory(quizMissingStoryId);
  const storiesById = new Map([
    [quizReadyStoryId, quizReadyStory],
    [quizMissingStoryId, quizMissingStory],
  ]);

  const quizPayload = mockStoryQuizPayload();
  const completedQuiz = {
    id: quizId,
    storyId: quizReadyStoryId,
    userId,
    childProfileId: null,
    language: 'en',
    sourceAgeGroup: '6-8',
    quizAgeBucket: '6-8',
    promptVersion: 'quiz-v22',
    sourceFingerprint: 'ignored-by-mock',
    status: 'completed',
    payload: quizPayload,
    errorMessage: null,
    generationTimeMs: 12,
    createdAt: now,
    updatedAt: now,
  } as any;

  let candidateStories: any[] = [quizMissingStory];

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
      findByIdAndUser: async (id: string, requestedUserId: string) => {
        const story = storiesById.get(id);
        return story && story.userId === requestedUserId ? story : null;
      },
      findRequestById: async () => null,
      findLinkedCharactersByStoryId: async () => [],
      findQuizCandidateStoriesByUser: async () => candidateStories,
    } as any,
    scene: {
      findByStoryId: async () => [],
    } as any,
    storyQuiz: {
      findByKey: async (key: { storyId: string }) =>
        key.storyId === quizReadyStoryId ? completedQuiz : null,
    } as any,
    storyQuizProgress: {
      findByOwner: async () => null,
    } as any,
  });

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;

  const get = (path: string) =>
    fetch(`${origin}${path}`, { headers: { authorization } });
  const put = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: 'PUT',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  try {
    const quizOk = await get(`/api/v1/me/stories/${quizReadyStoryId}/quiz`);
    assert.equal(quizOk.status, 200, 'ready quiz returns 200');
    const quizOkBody = (await quizOk.json()) as any;
    assert.equal(quizOkBody.status, 'success');
    assert.equal(quizOkBody.quiz.id, quizId);
    assert.equal(quizOkBody.quiz.payload.activities.length, 9);

    const quizMissing = await get(`/api/v1/me/stories/${quizMissingStoryId}/quiz`);
    assert.equal(quizMissing.status, 404, 'missing quiz returns 404');
    const quizMissingBody = (await quizMissing.json()) as any;
    assert.equal(quizMissingBody.code, 'QUIZ_NOT_GENERATED');

    const quizUnknownStory = await get(
      '/api/v1/me/stories/b9999999-9999-4999-8999-999999999999/quiz'
    );
    assert.equal(quizUnknownStory.status, 404, 'unknown story returns 404');
    const quizUnknownBody = (await quizUnknownStory.json()) as any;
    assert.equal(quizUnknownBody.code, 'STORY_NOT_FOUND');

    const candidateOk = await get('/api/v1/me/stories/quiz-candidate');
    assert.equal(candidateOk.status, 200, 'candidate with stories returns 200');
    const candidateOkBody = (await candidateOk.json()) as any;
    assert.equal(candidateOkBody.status, 'success');
    assert.equal(candidateOkBody.candidate.storyId, quizMissingStoryId);
    assert.equal(candidateOkBody.candidate.quizStatus, 'not_generated');

    candidateStories = [];
    const candidateEmpty = await get('/api/v1/me/stories/quiz-candidate');
    assert.equal(candidateEmpty.status, 200, 'empty candidate returns 200');
    const candidateEmptyBody = (await candidateEmpty.json()) as any;
    assert.equal(candidateEmptyBody.candidate, null);

    const answerInvalid = await put(
      `/api/v1/me/stories/${quizReadyStoryId}/quiz/answers/not_a_real_activity`,
      { selectedIds: ['a'] }
    );
    assert.equal(answerInvalid.status, 400, 'invalid activity returns 400');
    const answerInvalidBody = (await answerInvalid.json()) as any;
    assert.equal(answerInvalidBody.code, 'QUIZ_ANSWER_INVALID');
  } finally {
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('quiz read HTTP contract passed (6 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
