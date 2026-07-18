import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface HttpCase {
  method: HttpMethod;
  path: string;
  body?: unknown;
}

const userId = '11111111-1111-4111-8111-111111111111';
const childProfileId = '22222222-2222-4222-8222-222222222222';
const siblingProfileId = '33333333-3333-4333-8333-333333333333';
const storyId = '44444444-4444-4444-8444-444444444444';
const parentSessionId = '55555555-5555-4555-8555-555555555555';
const childSessionId = '66666666-6666-4666-8666-666666666666';
const selfCharacterId = '88888888-8888-4888-8888-888888888881';
const allowedCharacterId = '88888888-8888-4888-8888-888888888882';
const deniedCharacterId = '88888888-8888-4888-8888-888888888883';
const createdChildSessionIds = [
  '77777777-7777-4777-8777-777777777771',
  '77777777-7777-4777-8777-777777777772',
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
  const { DEFAULT_CHILD_MODE_SETTINGS } = await import('../../services/childModeControlsService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');

  const now = new Date();
  const user = {
    id: userId,
    email: 'parental-permissions@example.test',
    displayName: 'Parental Permissions',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
    childModeExitPasscodeHash: 'configured-passcode-hash',
    childModeExitPasscodeSetAt: now,
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
    token: 'parent-repository-token',
    deviceName: null,
    deviceType: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  let activeChildScopes = ['child_mode', 'story:free_text', 'story:audio', 'story:quiz'];
  let activeChildSessionCount = 1;
  let currentProfile: any;
  let childStoryCounts: number[] = [];
  let dailyAudioUsage = 0;
  let storyReadOptions: any[] = [];
  const updatedChildSessionScopes: Array<{ childProfileId: string; scopes: string[] }> = [];
  const deletedChildSessionProfiles: string[] = [];
  const createdChildSessions: any[] = [];

  const buildProfile = (settings: Record<string, unknown>, childModeEnabled = true) =>
    ({
      id: childProfileId,
      userId,
      name: 'Mira',
      birthDate: '2018-01-01',
      storyCreationMode: 'artisan',
      authorPseudonym: null,
      authorAboutMe: null,
      referencePhotos: null,
      turnaroundSheet: null,
      childModeEnabled,
      childModeSettings: settings,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }) as any;

  const story = {
    id: storyId,
    userId,
    childProfileId: null,
    createdByMode: 'child',
    createdByChildProfileId: childProfileId,
    title: 'The Lantern Path',
    language: 'en',
    ageGroup: '6-8',
    moralTheme: null,
    scenes: [],
    fullText: 'Mira followed the lantern path home.',
    wordCount: 7,
    outline: null,
    audioMetadata: null,
    metadata: {},
    storyRequestId: null,
    isFavorite: false,
    isPublished: false,
    seriesId: null,
    partNumber: null,
    createdAt: now,
  } as any;

  const sessionRepository = {
    findValidByIdWithUser: async (sessionId: string) => {
      if (sessionId === parentSessionId) return { session: parentSession, user };
      if (sessionId === childSessionId) {
        return {
          session: {
            ...parentSession,
            id: childSessionId,
            mode: 'child',
            childProfileId,
            scopes: [...activeChildScopes],
            token: 'child-repository-token',
          },
          user,
        };
      }
      return null;
    },
    updateLastActive: async () => undefined,
    countActiveChildSessionsByProfileIds: async () =>
      activeChildSessionCount > 0
        ? new Map([[childProfileId, activeChildSessionCount]])
        : new Map(),
    updateChildSessionScopes: async (profileId: string, scopes: string[]) => {
      updatedChildSessionScopes.push({ childProfileId: profileId, scopes: [...scopes] });
      activeChildScopes = [...scopes];
      return activeChildSessionCount;
    },
    deleteByChildProfileId: async (profileId: string) => {
      deletedChildSessionProfiles.push(profileId);
      const deleted = activeChildSessionCount;
      activeChildSessionCount = 0;
      return deleted;
    },
    create: async (data: any) => {
      const created = {
        id: createdChildSessionIds[createdChildSessions.length],
        ...data,
        scopes: [...data.scopes],
        createdAt: now,
        lastActiveAt: now,
        revokedAt: null,
      };
      createdChildSessions.push(created);
      activeChildScopes = [...created.scopes];
      activeChildSessionCount += 1;
      return created;
    },
  } as any;

  installRepositoryTestOverrides({
    session: sessionRepository,
    user: {
      findById: async () => user,
      findPublicAuthorsByIds: async () => [],
    } as any,
    childProfile: {
      findById: async (id: string, ownerUserId: string) =>
        id === childProfileId && ownerUserId === userId ? currentProfile : null,
      findByUserId: async (ownerUserId: string) =>
        ownerUserId === userId && currentProfile ? [currentProfile] : [],
      update: async (id: string, ownerUserId: string, patch: any) => {
        assert.equal(id, childProfileId);
        assert.equal(ownerUserId, userId);
        currentProfile = { ...currentProfile, ...patch };
        return currentProfile;
      },
      findPublicChildAuthorsByIds: async () => [],
    } as any,
    character: {
      findByChildProfileId: async () => ({
        id: selfCharacterId,
        userId,
        childProfileId,
        name: 'Mira',
        type: 'person',
        subtype: 'child',
        clothing: null,
        defaultOutfitText: null,
      }),
      update: async (_id: string, _ownerUserId: string, patch: any) => ({
        id: selfCharacterId,
        userId,
        childProfileId,
        name: 'Mira',
        type: 'person',
        subtype: 'child',
        clothing: null,
        defaultOutfitText: null,
        ...patch,
      }),
      findByIds: async () => [
        {
          id: deniedCharacterId,
          userId,
          childProfileId: null,
          name: 'Unapproved Guide',
          type: 'person',
        },
      ],
    } as any,
    story: {
      countChildCreatedRequestsSince: async () => childStoryCounts.shift() ?? 0,
      findByIdAndUser: async () => story,
      findLinkedCharactersByStoryId: async () => [],
      listPublished: async () => [],
      countPublished: async () => 0,
      countByUser: async (_ownerUserId: string, options: any) => {
        storyReadOptions.push(options);
        return 0;
      },
      findSummariesByUser: async (_ownerUserId: string, options: any) => {
        storyReadOptions.push(options);
        return [];
      },
    } as any,
    usageEvents: {
      getUsageForPeriod: async () => dailyAudioUsage,
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
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;
  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;
  let requestSequence = 0;

  const request = async (input: HttpCase, authorization: string) => {
    requestSequence += 1;
    return fetch(`${origin}${input.path}`, {
      method: input.method,
      headers: {
        authorization,
        'x-forwarded-for': `198.51.100.${requestSequence}`,
        ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  };

  const assertPolicyResponse = async (
    response: Response,
    expectedStatus: number,
    expectedCode: string
  ) => {
    assert.equal(response.status, expectedStatus);
    const body = (await response.json()) as any;
    assert.equal(body.status, 'error');
    assert.equal(body.code, expectedCode);
  };

  try {
    const baseStoryBody = {
      childProfileId,
      uiLocale: 'en',
      storyLanguage: 'en',
      goal: 'kindness',
    };
    const storyPermissionCases = [
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, storyGenerationEnabled: false },
        body: baseStoryBody,
        counts: [0, 0],
        status: 403,
        code: 'CHILD_STORY_GENERATION_DISABLED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, freeTextPromptsEnabled: false },
        body: { ...baseStoryBody, userNotes: 'Add a dragon.' },
        counts: [0, 0],
        status: 403,
        code: 'CHILD_FREE_TEXT_DISABLED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedLanguageCodes: ['uk'] },
        body: baseStoryBody,
        counts: [0, 0],
        status: 403,
        code: 'CHILD_LANGUAGE_NOT_ALLOWED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowedThemeSlugs: ['courage'] },
        body: baseStoryBody,
        counts: [0, 0],
        status: 403,
        code: 'CHILD_THEME_NOT_ALLOWED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, allowSiblingCharacters: false },
        body: { ...baseStoryBody, selectedChildren: [siblingProfileId] },
        counts: [0, 0],
        status: 403,
        code: 'CHILD_SIBLINGS_DISABLED',
      },
      {
        settings: {
          ...DEFAULT_CHILD_MODE_SETTINGS,
          allowedCharacterIds: [allowedCharacterId],
        },
        body: { ...baseStoryBody, selectedCharacters: [deniedCharacterId] },
        counts: [0, 0],
        status: 403,
        code: 'CHILD_CHARACTER_NOT_ALLOWED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, dailyGenerationLimit: 1 },
        body: baseStoryBody,
        counts: [1, 1],
        status: 429,
        code: 'CHILD_DAILY_LIMIT_REACHED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, monthlyGenerationLimit: 3 },
        body: baseStoryBody,
        counts: [0, 3],
        status: 429,
        code: 'CHILD_MONTHLY_LIMIT_REACHED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS },
        body: baseStoryBody,
        counts: [],
        childModeEnabled: false,
        status: 403,
        code: 'CHILD_MODE_DISABLED',
      },
    ];

    for (const permissionCase of storyPermissionCases) {
      currentProfile = buildProfile(
        permissionCase.settings,
        permissionCase.childModeEnabled ?? true
      );
      childStoryCounts = [...permissionCase.counts];
      const response = await request(
        { method: 'POST', path: '/api/v1/stories/child-mode', body: permissionCase.body },
        childAuthorization
      );
      await assertPolicyResponse(response, permissionCase.status, permissionCase.code);
    }

    for (const audioCase of [
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, audioGenerationEnabled: false },
        usage: 0,
        status: 403,
        code: 'CHILD_AUDIO_DISABLED',
      },
      {
        settings: { ...DEFAULT_CHILD_MODE_SETTINGS, dailyAudioGenerationLimit: 1 },
        usage: 1,
        status: 429,
        code: 'CHILD_DAILY_AUDIO_LIMIT_REACHED',
      },
    ]) {
      currentProfile = buildProfile(audioCase.settings);
      dailyAudioUsage = audioCase.usage;
      const response = await request(
        { method: 'POST', path: `/api/v1/stories/${storyId}/audio`, body: {} },
        childAuthorization
      );
      await assertPolicyResponse(response, audioCase.status, audioCase.code);
    }

    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      quizGenerationEnabled: false,
    });
    await assertPolicyResponse(
      await request(
        { method: 'POST', path: `/api/v1/me/stories/${storyId}/quiz`, body: {} },
        childAuthorization
      ),
      403,
      'CHILD_SESSION_QUIZ_DISABLED'
    );

    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      storyContinuationEnabled: false,
    });
    childStoryCounts = [0, 0];
    await assertPolicyResponse(
      await request(
        { method: 'POST', path: `/api/v1/stories/${storyId}/continue`, body: {} },
        childAuthorization
      ),
      403,
      'CHILD_STORY_CONTINUATION_DISABLED'
    );

    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      parentReviewRequired: true,
    });
    await assertPolicyResponse(
      await request(
        {
          method: 'PATCH',
          path: `/api/v1/stories/${storyId}`,
          body: { isPublished: true },
        },
        childAuthorization
      ),
      403,
      'CHILD_PUBLISH_REQUIRES_PARENT_REVIEW'
    );

    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      publicStoriesEnabled: false,
    });
    await assertPolicyResponse(
      await request({ method: 'GET', path: '/api/v1/public/stories' }, childAuthorization),
      403,
      'CHILD_PUBLIC_STORIES_DISABLED'
    );

    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      publicStoriesEnabled: true,
    });
    const publicStoriesAllowed = await request(
      { method: 'GET', path: '/api/v1/public/stories' },
      childAuthorization
    );
    assert.equal(publicStoriesAllowed.status, 200);
    const publicStoriesAllowedBody = (await publicStoriesAllowed.json()) as any;
    assert.deepEqual(publicStoriesAllowedBody.stories, []);

    activeChildScopes = ['child_mode'];
    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      allowSharedFamilyStories: false,
    });
    storyReadOptions = [];
    const childScopedStories = await request(
      { method: 'GET', path: '/api/v1/me/stories?view=summary' },
      childAuthorization
    );
    assert.equal(childScopedStories.status, 200);
    assert.equal(storyReadOptions.length, 2);
    assert.ok(storyReadOptions.every((options) => options.childProfileId === childProfileId));

    await assertPolicyResponse(
      await request({ method: 'GET', path: '/api/v1/me/series' }, childAuthorization),
      403,
      'CHILD_FAMILY_STORIES_DISABLED'
    );

    activeChildScopes = ['child_mode', 'family_stories:read'];
    currentProfile = buildProfile({
      ...DEFAULT_CHILD_MODE_SETTINGS,
      allowSharedFamilyStories: true,
    });
    storyReadOptions = [];
    const familyStories = await request(
      { method: 'GET', path: '/api/v1/me/stories?view=summary' },
      childAuthorization
    );
    assert.equal(familyStories.status, 200);
    assert.equal(storyReadOptions.length, 2);
    assert.ok(storyReadOptions.every((options) => options.childProfileId === undefined));

    const expectedNormalizedSettings = {
      storyGenerationEnabled: true,
      storyContinuationEnabled: false,
      publicStoriesEnabled: false,
      dailyGenerationLimit: 2,
      dailyAudioGenerationLimit: 1,
      monthlyGenerationLimit: 7,
      allowedThemeSlugs: ['kindness', 'courage'],
      allowedLanguageCodes: ['en', 'uk'],
      allowedCharacterIds: [],
      freeTextPromptsEnabled: false,
      audioGenerationEnabled: true,
      quizGenerationEnabled: false,
      parentReviewRequired: true,
      allowSiblingCharacters: true,
      allowSharedFamilyStories: true,
    };
    currentProfile = buildProfile({ storyGenerationEnabled: true });
    activeChildSessionCount = 1;
    updatedChildSessionScopes.length = 0;
    const updateControls = await request(
      {
        method: 'PATCH',
        path: `/api/v1/children/${childProfileId}/child-mode`,
        body: {
          childModeEnabled: true,
          childModeSettings: {
            storyContinuationEnabled: false,
            publicStoriesEnabled: false,
            dailyGenerationLimit: 2,
            dailyAudioGenerationLimit: 1,
            monthlyGenerationLimit: 7,
            allowedThemeSlugs: ['kindness', 'courage'],
            allowedLanguageCodes: ['en', 'uk'],
            allowedCharacterIds: [],
            freeTextPromptsEnabled: false,
            audioGenerationEnabled: true,
            quizGenerationEnabled: false,
            parentReviewRequired: true,
            allowSiblingCharacters: true,
            allowSharedFamilyStories: true,
          },
        },
      },
      parentAuthorization
    );
    assert.equal(updateControls.status, 200);
    const updateControlsBody = (await updateControls.json()) as any;
    assert.deepEqual(updateControlsBody.childMode.childModeSettings, expectedNormalizedSettings);
    assert.deepEqual(updatedChildSessionScopes, [
      {
        childProfileId,
        scopes: ['child_mode', 'story:audio', 'family_stories:read'],
      },
    ]);

    deletedChildSessionProfiles.length = 0;
    const disableControls = await request(
      {
        method: 'PATCH',
        path: `/api/v1/children/${childProfileId}/child-mode`,
        body: { childModeEnabled: false },
      },
      parentAuthorization
    );
    assert.equal(disableControls.status, 200);
    const disableControlsBody = (await disableControls.json()) as any;
    assert.equal(disableControlsBody.childMode.childModeEnabled, false);
    assert.equal(disableControlsBody.childMode.activeSessionCount, 0);
    assert.deepEqual(deletedChildSessionProfiles, [childProfileId]);

    createdChildSessions.length = 0;
    for (const createSessionCase of [
      {
        settings: {
          ...DEFAULT_CHILD_MODE_SETTINGS,
          freeTextPromptsEnabled: true,
          audioGenerationEnabled: true,
          quizGenerationEnabled: false,
          allowSharedFamilyStories: false,
        },
        expectedScopes: ['child_mode', 'story:free_text', 'story:audio'],
      },
      {
        settings: {
          ...DEFAULT_CHILD_MODE_SETTINGS,
          freeTextPromptsEnabled: false,
          audioGenerationEnabled: false,
          quizGenerationEnabled: true,
          allowSharedFamilyStories: true,
        },
        expectedScopes: ['child_mode', 'story:quiz', 'family_stories:read'],
      },
    ]) {
      currentProfile = buildProfile(createSessionCase.settings, true);
      const createChildSession = await request(
        {
          method: 'POST',
          path: `/api/v1/children/${childProfileId}/child-mode/sessions`,
          body: {},
        },
        parentAuthorization
      );
      assert.equal(createChildSession.status, 201);
      const createChildSessionBody = (await createChildSession.json()) as any;
      assert.deepEqual(createChildSessionBody.session.scopes, createSessionCase.expectedScopes);
      assert.deepEqual(createdChildSessions.at(-1)?.scopes, createSessionCase.expectedScopes);
    }

    // GET switcher / current / :id/child-mode and DELETE sessions happy paths.
    currentProfile = buildProfile(DEFAULT_CHILD_MODE_SETTINGS, true);
    activeChildSessionCount = 2;

    const switcher = await request(
      { method: 'GET', path: '/api/v1/children/child-mode/switcher' },
      parentAuthorization
    );
    assert.equal(switcher.status, 200);
    const switcherBody = (await switcher.json()) as any;
    assert.equal(switcherBody.status, 'success');
    assert.equal(switcherBody.children.length, 1);
    assert.equal(switcherBody.children[0].id, childProfileId);
    assert.equal(switcherBody.children[0].name, 'Mira');
    assert.equal(switcherBody.children[0].storyCreationMode, 'artisan');

    const currentControls = await request(
      { method: 'GET', path: '/api/v1/children/child-mode/current' },
      childAuthorization
    );
    assert.equal(currentControls.status, 200);
    const currentControlsBody = (await currentControls.json()) as any;
    assert.equal(currentControlsBody.childMode.childModeEnabled, true);
    assert.deepEqual(
      currentControlsBody.childMode.childModeSettings,
      {
        ...DEFAULT_CHILD_MODE_SETTINGS,
      }
    );

    const parentGetControls = await request(
      { method: 'GET', path: `/api/v1/children/${childProfileId}/child-mode` },
      parentAuthorization
    );
    assert.equal(parentGetControls.status, 200);
    const parentGetControlsBody = (await parentGetControls.json()) as any;
    assert.equal(parentGetControlsBody.childMode.childModeEnabled, true);
    assert.equal(parentGetControlsBody.childMode.childModePasscodeConfigured, true);
    assert.equal(parentGetControlsBody.childMode.activeSessionCount, 2);
    assert.deepEqual(
      parentGetControlsBody.childMode.childModeSettings,
      DEFAULT_CHILD_MODE_SETTINGS
    );

    const missingControls = await request(
      {
        method: 'GET',
        path: `/api/v1/children/${siblingProfileId}/child-mode`,
      },
      parentAuthorization
    );
    assert.equal(missingControls.status, 404);

    deletedChildSessionProfiles.length = 0;
    const revokeSessions = await request(
      {
        method: 'DELETE',
        path: `/api/v1/children/${childProfileId}/child-mode/sessions`,
      },
      parentAuthorization
    );
    assert.equal(revokeSessions.status, 200);
    const revokeSessionsBody = (await revokeSessions.json()) as any;
    assert.equal(revokeSessionsBody.status, 'success');
    assert.equal(revokeSessionsBody.revokedCount, 2);
    assert.deepEqual(deletedChildSessionProfiles, [childProfileId]);
    assert.equal(activeChildSessionCount, 0);

    const revokeAgain = await request(
      {
        method: 'DELETE',
        path: `/api/v1/children/${childProfileId}/child-mode/sessions`,
      },
      parentAuthorization
    );
    assert.equal(revokeAgain.status, 200);
    const revokeAgainBody = (await revokeAgain.json()) as any;
    assert.equal(revokeAgainBody.revokedCount, 0);
  } finally {
    await close(server);
    clearRepositoryTestOverrides();
  }

  console.log('child mode parental permissions HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
