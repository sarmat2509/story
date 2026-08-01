import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { MOCK_ALIGNMENT, MockTextProvider, mockStoryQuizPayload } from '../../testing/ai';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ProtectedEndpointCase {
  method: HttpMethod;
  path: string;
}

const id = '11111111-1111-4111-8111-111111111111';
const childProfileId = '11111111-1111-4111-8111-111111111112';
const characterId = '11111111-1111-4111-8111-111111111113';

/**
 * Authenticated endpoints called by the universal app and admin app.
 * Every case is sent through the real Express middleware/route stack.
 */
const protectedClientEndpoints: ProtectedEndpointCase[] = [
  { method: 'GET', path: '/api/v1/me' },
  { method: 'PATCH', path: '/api/v1/me' },
  { method: 'DELETE', path: '/api/v1/me' },
  { method: 'PATCH', path: '/api/v1/me/child-mode-exit-passcode' },
  { method: 'GET', path: '/api/v1/me/subscription-usage' },
  { method: 'GET', path: '/api/v1/me/series' },
  { method: 'GET', path: '/api/v1/me/stories' },
  { method: 'GET', path: '/api/v1/me/stories/languages' },
  { method: 'GET', path: '/api/v1/me/stories/quiz-candidate' },
  { method: 'GET', path: `/api/v1/me/stories/${id}` },
  { method: 'GET', path: `/api/v1/me/stories/${id}/alignment` },
  { method: 'GET', path: `/api/v1/me/stories/${id}/quiz` },
  { method: 'POST', path: `/api/v1/me/stories/${id}/quiz` },
  { method: 'PUT', path: `/api/v1/me/stories/${id}/quiz/answers/check_1` },
  { method: 'PUT', path: '/api/v1/me/story-mix' },
  { method: 'GET', path: '/api/v1/me/artifacts' },
  { method: 'POST', path: '/api/v1/me/artifacts/collect' },
  { method: 'GET', path: '/api/v1/me/map-tiles' },
  { method: 'GET', path: `/api/v1/me/map-tiles/story/${id}` },
  { method: 'POST', path: '/api/v1/me/map-tiles/collect' },
  { method: 'PUT', path: '/api/v1/me/map-tiles/layout' },
  { method: 'GET', path: '/api/v1/entitlements' },
  { method: 'GET', path: '/api/v1/bundles' },
  { method: 'GET', path: '/api/v1/voices?language=en' },
  { method: 'GET', path: '/api/v1/children' },
  { method: 'POST', path: '/api/v1/children' },
  { method: 'POST', path: '/api/v1/children/analyze' },
  { method: 'GET', path: '/api/v1/children/child-mode/switcher' },
  { method: 'GET', path: '/api/v1/children/child-mode/current' },
  { method: 'PATCH', path: `/api/v1/children/${id}` },
  { method: 'DELETE', path: `/api/v1/children/${id}` },
  { method: 'GET', path: `/api/v1/children/${id}/child-mode` },
  { method: 'PATCH', path: `/api/v1/children/${id}/child-mode` },
  { method: 'POST', path: `/api/v1/children/${id}/child-mode/sessions` },
  { method: 'DELETE', path: `/api/v1/children/${id}/child-mode/sessions` },
  { method: 'GET', path: '/api/v1/characters' },
  { method: 'POST', path: '/api/v1/characters' },
  { method: 'POST', path: '/api/v1/characters/analyze' },
  { method: 'GET', path: `/api/v1/characters/${id}` },
  { method: 'GET', path: `/api/v1/characters/${id}/shared-preview` },
  { method: 'PATCH', path: `/api/v1/characters/${id}` },
  { method: 'PATCH', path: `/api/v1/characters/${id}/name` },
  { method: 'DELETE', path: `/api/v1/characters/${id}` },
  {
    method: 'POST',
    path: `/api/v1/public/stories/test-story/characters/${characterId}/save`,
  },
  {
    method: 'GET',
    path: `/api/v1/public/stories/test-story/characters/${characterId}/image`,
  },
  {
    method: 'POST',
    path: `/api/v1/public/u/test-token/characters/${characterId}/save`,
  },
  {
    method: 'GET',
    path: `/api/v1/public/u/test-token/characters/${characterId}/image`,
  },
  { method: 'POST', path: '/api/v1/stories' },
  { method: 'POST', path: '/api/v1/stories/child-mode' },
  { method: 'POST', path: '/api/v1/stories/instant' },
  { method: 'GET', path: `/api/v1/stories/requests/${id}/status` },
  { method: 'POST', path: `/api/v1/stories/requests/${id}/retry-images` },
  { method: 'GET', path: `/api/v1/stories/${id}/manifest` },
  { method: 'GET', path: `/api/v1/stories/${id}/generation-status` },
  { method: 'PATCH', path: `/api/v1/stories/${id}/parent-review` },
  { method: 'POST', path: `/api/v1/stories/${id}/audio` },
  { method: 'GET', path: `/api/v1/stories/${id}/audio-status` },
  { method: 'GET', path: `/api/v1/stories/${id}/audio` },
  { method: 'POST', path: `/api/v1/stories/${id}/alignment` },
  { method: 'POST', path: `/api/v1/stories/${id}/map-tile` },
  { method: 'GET', path: `/api/v1/stories/${id}/schedule` },
  { method: 'POST', path: `/api/v1/stories/${id}/schedule-continuation` },
  { method: 'DELETE', path: `/api/v1/stories/${id}/schedule-continuation` },
  { method: 'POST', path: `/api/v1/stories/${id}/continue` },
  { method: 'GET', path: `/api/v1/stories/${id}/series` },
  { method: 'PATCH', path: `/api/v1/stories/${id}` },
  { method: 'DELETE', path: `/api/v1/stories/${id}` },
  { method: 'POST', path: '/api/v1/graphic-novels' },
  { method: 'GET', path: `/api/v1/graphic-novels/${id}` },
  { method: 'GET', path: `/api/v1/graphic-novels/${id}/generation-status` },
  { method: 'POST', path: '/api/v1/mixed-stories' },
  { method: 'POST', path: '/api/v1/billing/bundle-checkout' },
  { method: 'POST', path: '/api/v1/billing/checkout-session' },
  { method: 'POST', path: '/api/v1/billing/discount-preview' },
  { method: 'POST', path: '/api/v1/billing/portal-session' },
  { method: 'GET', path: '/api/v1/plans/with-features' },
  { method: 'PUT', path: '/api/v1/plans/billing-currency' },
  { method: 'PUT', path: '/api/v1/plans/upgrade' },
  { method: 'POST', path: '/api/v1/upload/photo' },
  { method: 'DELETE', path: '/api/v1/upload/photo' },
  { method: 'GET', path: '/api/v1/me/privacy-requests' },
  { method: 'POST', path: '/api/v1/me/privacy-requests' },
  { method: 'POST', path: '/api/v1/auth/child-mode/recovery' },
  { method: 'POST', path: '/api/v1/auth/parent-gate' },
  { method: 'POST', path: '/api/v1/auth/parent-gate/google/start' },
  { method: 'POST', path: '/api/v1/auth/parent-gate/google-token' },
  { method: 'POST', path: '/api/v1/auth/parent-gate/apple-token' },
  { method: 'POST', path: '/api/v1/auth/logout' },
  { method: 'GET', path: '/api/v1/admin/dashboard' },
  { method: 'GET', path: `/api/v1/admin/jobs/${id}` },
  { method: 'GET', path: '/api/v1/admin/stories' },
  { method: 'PATCH', path: `/api/v1/admin/stories/${id}` },
  { method: 'GET', path: '/api/v1/admin/users' },
  { method: 'PATCH', path: `/api/v1/admin/users/${id}` },
  { method: 'GET', path: '/api/v1/admin/outfits' },
  { method: 'POST', path: '/api/v1/admin/outfits/search' },
  { method: 'GET', path: '/api/v1/admin/environments' },
  { method: 'POST', path: '/api/v1/admin/environments/search' },
  { method: 'GET', path: '/api/v1/admin/voices' },
  { method: 'PATCH', path: `/api/v1/admin/voices/${id}` },
  { method: 'GET', path: '/api/v1/admin/discount-codes' },
  { method: 'GET', path: '/api/v1/admin/discount-codes/options' },
  { method: 'POST', path: '/api/v1/admin/discount-codes' },
  { method: 'PATCH', path: `/api/v1/admin/discount-codes/${id}` },
  { method: 'GET', path: '/api/v1/admin/feedback' },
  { method: 'GET', path: '/api/v1/admin/privacy-requests' },
  { method: 'PATCH', path: `/api/v1/admin/privacy-requests/${id}` },
  { method: 'GET', path: `/api/v1/admin/privacy-requests/${id}/export` },
  { method: 'GET', path: '/api/v1/admin/image-validations' },
  {
    method: 'GET',
    path: '/api/v1/admin/image-validations/analytics/character-regenerations',
  },
  { method: 'GET', path: `/api/v1/admin/image-validations/${id}` },
  {
    method: 'POST',
    path: `/api/v1/admin/image-validations/${id}/apply-best-scene-image`,
  },
  { method: 'POST', path: `/api/v1/admin/stories/${id}/audio/reset` },
  {
    method: 'POST',
    path: `/api/v1/admin/stories/${id}/scenes/1/regenerate-image`,
  },
  {
    method: 'POST',
    path: `/api/v1/admin/stories/${id}/graphic-novel-pages/1/regenerate-image`,
  },
  { method: 'GET', path: `/api/v1/admin/stories/${id}/director-scenes` },
  { method: 'GET', path: '/api/v1/admin/content-config/story-goals' },
  { method: 'POST', path: '/api/v1/admin/content-config/story-goals' },
  { method: 'PATCH', path: `/api/v1/admin/content-config/story-goals/${id}` },
  { method: 'DELETE', path: `/api/v1/admin/content-config/story-goals/${id}` },
  { method: 'GET', path: '/api/v1/admin/app-releases' },
  { method: 'GET', path: `/api/v1/admin/app-releases/${id}` },
  { method: 'POST', path: '/api/v1/admin/app-releases' },
  { method: 'PUT', path: `/api/v1/admin/app-releases/${id}` },
  { method: 'GET', path: `/api/v1/admin/app-releases/${id}/email-preview/en` },
  { method: 'POST', path: `/api/v1/admin/app-releases/${id}/media` },
  { method: 'DELETE', path: `/api/v1/admin/app-releases/${id}/media/${id}` },
  { method: 'GET', path: '/health/detailed' },
  { method: 'GET', path: '/health/queues' },
  { method: 'GET', path: '/health/image-rate-limiter' },
  { method: 'POST', path: '/api/v1/auth/parent-gate/apple/start' },
  { method: 'DELETE', path: '/api/v1/auth/sessions' },
  { method: 'DELETE', path: '/api/v1/auth/sessions/current' },
  { method: 'PUT', path: '/api/v1/auth/sessions/current' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  { method: 'GET', path: '/api/v1/me/sessions' },
  { method: 'DELETE', path: `/api/v1/me/sessions/${id}` },
  { method: 'GET', path: '/api/v1/me/oauth-providers' },
  { method: 'POST', path: '/api/v1/me/oauth-providers' },
  { method: 'DELETE', path: '/api/v1/me/oauth-providers/google' },
  { method: 'GET', path: `/api/v1/stories/${id}` },
  { method: 'GET', path: '/api/v1/stories' },
  { method: 'GET', path: `/api/v1/stories/${id}/status` },
  { method: 'GET', path: `/api/v1/stories/${id}/cost` },
  { method: 'POST', path: `/api/v1/stories/${id}/scenes/1/regenerate` },
  { method: 'POST', path: `/api/v1/stories/${id}/tts` },
  { method: 'GET', path: '/api/v1/image-validations' },
  { method: 'GET', path: '/api/v1/admin/ops/runtime' },
  { method: 'PATCH', path: '/api/v1/admin/ops/runtime' },
  { method: 'GET', path: '/api/v1/admin/moderation-decisions' },
  { method: 'GET', path: `/api/v1/admin/image-validations/${id}/image` },
  { method: 'GET', path: `/api/v1/admin/assets/${id}/image` },
  { method: 'GET', path: '/api/v1/admin/map-tile-masks/A/image' },
];

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
  const { clearAiServiceTestOverrides, installAiServiceTestOverrides } =
    await import('../../services/aiService');
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const apiRoot = await fetch(`${origin}/api/v1`);
    assert.equal(apiRoot.status, 200, 'public API root returns 200 without authentication');

    const now = new Date();
    const user = {
      id,
      email: 'api-contract@example.test',
      displayName: 'API Contract',
      role: 'user',
      status: 'active',
      preferredLocale: 'en',
      mode: 'artisan',
      onboardingCompleted: true,
      createdAt: now,
      updatedAt: now,
    } as any;
    const session = {
      id,
      userId: id,
      mode: 'parent',
      parentUserId: id,
      childProfileId: null,
      scopes: [],
      token: 'repository-token',
      deviceName: null,
      deviceType: null,
      ipAddress: null,
      userAgent: null,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
    } as any;
    const story = {
      id,
      userId: id,
      title: 'The Lantern Path',
      language: 'en',
      ageGroup: '6-8',
      fullText:
        'Mira found a lantern beside the path. She shared the light, and the friends reached home.',
      scenes: [
        { sceneId: 1, text: 'Mira found a lantern beside the path.' },
        { sceneId: 2, text: 'She shared the light, and the friends reached home.' },
      ],
      storyRequestId: null,
      childProfileId,
      createdByChildProfileId: null,
      createdAt: now,
      createdByMode: 'parent',
      parentReviewStatus: 'not_required',
      metadata: { imageGenerationComplete: true, sceneIdsWithImages: [] },
      audioMetadata: { totalDuration: 3.2, generatedAt: now.toISOString() },
      publishCharacters: true,
      closingArtifactId: '22222222-2222-4222-8222-222222222222',
      closingKeepsakeLabel: 'Lantern Badge',
    } as any;
    const childProfile = {
      id: childProfileId,
      userId: id,
      name: 'Mira',
      birthDate: '2018-05-15',
      languages: ['en'],
      referencePhotos: [],
      turnaroundSheet: null,
      aiGeneratedDescription: 'A curious young reader.',
      storyTextSizeMultiplier: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as any;
    const linkedCharacter = {
      id: characterId,
      userId: id,
      childProfileId: null,
      name: 'Maple Fox',
      type: 'animal',
      subtype: 'fox',
      role: 'companion',
      isHidden: false,
      isActive: true,
      description: 'A friendly fox carrying a tiny lantern.',
      referencePhotos: [],
      turnaroundSheet: null,
      createdAt: now,
      updatedAt: now,
    } as any;
    const artifact = {
      id: story.closingArtifactId,
      artifactCode: 'lantern-badge',
      title: 'Lantern Badge',
      description: 'A badge earned by sharing the light.',
      imagePath: 'artifacts/lantern-badge.png',
      semanticTags: ['kindness'],
    } as any;
    const collectedArtifact = {
      collection: {
        id: '33333333-3333-4333-8333-333333333333',
        userId: id,
        childProfileId: null,
        artifactId: artifact.id,
        storyId: story.id,
        acquiredLabel: 'Lantern Badge',
        acquiredAt: now,
      },
      artifact,
      story,
    } as any;
    const baseRepositoryOverrides = {
      session: {
        findValidByIdWithUser: async () => ({ session, user }),
        updateLastActive: async () => undefined,
      } as any,
      user: {
        findById: async () => user,
      } as any,
      oauth: {
        findProvidersByUserId: async () => [],
      } as any,
      story: {
        findByIdAndUser: async () => story,
        findById: async () => story,
        findLinkedCharactersByStoryId: async () => [linkedCharacter],
      } as any,
      childProfile: {
        findById: async () => childProfile,
        findByUserId: async () => [childProfile],
        findByIds: async () => [childProfile],
        findByIdsIncludingInactive: async () => [childProfile],
      } as any,
      scene: {
        findByStoryId: async () => story.scenes,
      } as any,
      asset: {
        findByStoryId: async () => [],
        findCompletedSceneImagesByStoryId: async () => [],
      } as any,
      alignment: {
        findByStoryId: async () => ({ data: MOCK_ALIGNMENT }),
      } as any,
      dictionary: {
        findTranslations: async () => [],
        findTranslationsForEntities: async () => [],
      } as any,
      storyArtifact: {
        findById: async () => artifact,
      } as any,
      collectedStoryArtifact: {
        findForOwnerStoryArtifact: async () => null,
        create: async () => collectedArtifact,
        listForUser: async () => [collectedArtifact],
      } as any,
      usageEvents: {
        create: async (input: any) => ({ id: 'usage-1', ...input }),
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
    } as any;
    installRepositoryTestOverrides(baseRepositoryOverrides);

    try {
      const authenticatedMe = await fetch(`${origin}/api/v1/me`, {
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
        },
      });
      assert.equal(authenticatedMe.status, 200, 'authenticated GET /api/v1/me returns 200');
      const authenticatedBody = (await authenticatedMe.json()) as any;
      assert.equal(authenticatedBody.status, 'success');
      assert.equal(authenticatedBody.user.id, id);

      const collectArtifact = await fetch(`${origin}/api/v1/me/artifacts/collect`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ storyId: id }),
      });
      assert.equal(collectArtifact.status, 201, 'first artifact collection returns 201');
      const collectArtifactBody = (await collectArtifact.json()) as any;
      assert.equal(collectArtifactBody.status, 'success');
      assert.equal(collectArtifactBody.artifact.artifact.id, artifact.id);

      const listArtifacts = await fetch(`${origin}/api/v1/me/artifacts`, {
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
        },
      });
      assert.equal(listArtifacts.status, 200, 'artifact collection list returns 200');
      const listArtifactsBody = (await listArtifacts.json()) as any;
      assert.equal(listArtifactsBody.artifacts.length, 1);
      assert.equal(listArtifacts.headers.get('cache-control'), 'private, no-store');

      const alignment = await fetch(`${origin}/api/v1/me/stories/${id}/alignment`, {
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
        },
      });
      assert.equal(alignment.status, 200, 'follow-along alignment returns 200');
      const alignmentBody = (await alignment.json()) as any;
      assert.equal(alignmentBody.alignment.words[0].text, 'Hi');

      const storyManifest = await fetch(`${origin}/api/v1/me/stories/${id}`, {
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
        },
      });
      assert.equal(
        storyManifest.status,
        200,
        'rich story with child profile, character, metadata, and alignment returns 200'
      );
      const storyManifestBody = (await storyManifest.json()) as any;
      assert.equal(storyManifestBody.status, 'success');
      assert.equal(storyManifestBody.manifest.storyId, id);
      assert.equal(storyManifestBody.manifest.audioMetadata.alignment.words[0].text, 'Hi');
      assert.deepEqual(
        storyManifestBody.manifest.characters.map((character: any) => character.id),
        [childProfileId, characterId]
      );

      const dryRunMapTile = await fetch(`${origin}/api/v1/stories/${id}/map-tile`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mapTile: {
            description: 'A winding lantern path through the woods.',
            requiredFeatures: ['winding path', 'two lanterns'],
          },
          useStoryImageReferences: false,
          dryRun: true,
        }),
      });
      assert.equal(dryRunMapTile.status, 200, 'map tile dry run returns 200');
      const dryRunMapTileBody = (await dryRunMapTile.json()) as any;
      assert.equal(dryRunMapTileBody.status, 'success');
      assert.equal(dryRunMapTileBody.mapTile.dryRun, true);

      const quizPayload = mockStoryQuizPayload();
      const quizId = '44444444-4444-4444-8444-444444444444';
      const generatingQuiz = {
        id: quizId,
        storyId: id,
        userId: id,
        childProfileId: null,
        language: 'en',
        sourceAgeGroup: '6-8',
        quizAgeBucket: '6-8',
        promptVersion: 'story_quiz_v1',
        sourceFingerprint: 'mock-fingerprint',
        status: 'generating',
        payload: null,
        errorMessage: null,
        generationTimeMs: null,
        createdAt: now,
        updatedAt: now,
      } as any;
      const completedQuiz = {
        ...generatingQuiz,
        status: 'completed',
        payload: quizPayload,
        generationTimeMs: 1,
      } as any;
      installRepositoryTestOverrides({
        ...baseRepositoryOverrides,
        storyQuiz: {
          findByKey: async () => null,
          upsertGenerating: async () => generatingQuiz,
          markCompleted: async () => completedQuiz,
          markFailed: async () => undefined,
        } as any,
        storyQuizProgress: {
          findByOwner: async () => null,
        } as any,
      });
      const quizText = new MockTextProvider().queueStructured('text_quiz_generate', quizPayload);
      installAiServiceTestOverrides({ textProvider: quizText });

      try {
        const generateQuiz = await fetch(`${origin}/api/v1/me/stories/${id}/quiz`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(generateQuiz.status, 200, 'mocked quiz generation returns 200');
        const generateQuizBody = (await generateQuiz.json()) as any;
        assert.equal(generateQuizBody.quiz.payload.activities.length, 9);
        quizText.assertExhausted();
      } finally {
        clearAiServiceTestOverrides();
      }

      const progressRow = {
        id: '55555555-5555-4555-8555-555555555555',
        storyId: id,
        storyQuizId: quizId,
        userId: id,
        childProfileId: null,
        ownerType: 'parent_user',
        ownerId: id,
        answers: {
          check_1: {
            activityId: 'check_1',
            selectedIds: ['a'],
            isCorrect: true,
          },
        },
        completedCheckRewardAt: null,
        createdAt: now,
        updatedAt: now,
      } as any;
      installRepositoryTestOverrides({
        ...baseRepositoryOverrides,
        storyQuiz: {
          findByKey: async () => completedQuiz,
        } as any,
        storyQuizProgress: {
          findByOwner: async () => null,
          upsert: async () => progressRow,
        } as any,
      });
      const saveQuizAnswer = await fetch(`${origin}/api/v1/me/stories/${id}/quiz/answers/check_1`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${generateToken({ userId: id, sessionId: id })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ selectedIds: ['a'] }),
      });
      assert.equal(saveQuizAnswer.status, 200, 'saving a quiz answer returns 200');
      const saveQuizAnswerBody = (await saveQuizAnswer.json()) as any;
      assert.equal(saveQuizAnswerBody.progress.answers.check_1.isCorrect, true);
    } finally {
      clearAiServiceTestOverrides();
      clearRepositoryTestOverrides();
    }

    for (const [endpointIndex, endpoint] of protectedClientEndpoints.entries()) {
      const clientIp = `198.51.100.${endpointIndex + 1}`;
      const response = await fetch(`${origin}${endpoint.path}`, {
        method: endpoint.method,
        headers:
          endpoint.method === 'GET'
            ? { 'x-forwarded-for': clientIp }
            : { 'content-type': 'application/json', 'x-forwarded-for': clientIp },
        body:
          endpoint.method === 'GET' || endpoint.method === 'DELETE'
            ? undefined
            : JSON.stringify({}),
      });
      assert.equal(
        response.status,
        401,
        `${endpoint.method} ${endpoint.path} must reject an unauthenticated client with 401`
      );
    }
  } finally {
    await close(server);
  }

  console.log(
    `client API authorization contract passed (${protectedClientEndpoints.length} protected endpoints)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
