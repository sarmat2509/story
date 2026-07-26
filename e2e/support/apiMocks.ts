import type { Page, Route } from '@playwright/test';
import {
  billingPlans,
  defaultChildModeSettings,
  privateStories,
  privateStoryManifests,
  publicStories,
  storyThemes,
  subscriptionUsage,
  testChild,
  testChildProfile,
  testCharacter,
  testUser,
} from './testData';

export type ApiMockScenario =
  | 'default'
  | 'onboarding'
  | 'billing-usd'
  | 'character-create'
  | 'character-edit-delete'
  | 'child-controls-update'
  | 'child-series-allowed'
  | 'child-series-denied'
  | 'child-wizard-restricted'
  | 'child-story-generation-disabled'
  | 'child-continuation-disabled'
  | 'child-public-stories-allowed'
  | 'child-public-stories-denied'
  | 'child-free-text-disabled'
  | 'child-audio-disabled'
  | 'child-quiz-disabled'
  | 'child-siblings-allowed'
  | 'child-siblings-denied'
  | 'child-parent-review-required'
  | 'parent-mode-switch-instant'
  | 'child-mode-switch-instant'
  | 'story-continuation-retry'
  | 'story-review-publish'
  | 'admin-validation-bbox'
  | 'admin-validation-analytics';

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type MockResponse = {
  status?: number;
  body: unknown;
  contentType?: 'application/json' | 'image/png';
  requiredAuthorization?: string;
};

type MockDefinition = {
  method: ApiMethod;
  target: string;
  responses: MockResponse[];
};

export type ApiMockController = {
  assertNoUnexpectedRequests(): void;
};

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

const createdCharacter = {
  ...testCharacter,
  id: 'character-e2e-created-1',
  name: 'Nimbus',
  type: 'animal',
  description: 'A silver fox who maps the wind.',
};

const updatedCharacter = {
  ...testCharacter,
  name: 'Luna Updated',
};

const siblingCharacter = {
  ...testCharacter,
  id: 'character-e2e-sibling-1',
  name: 'Orion Sibling',
  childProfileId: 'child-e2e-sibling',
};

const usdBillingPlans = [
  { ...billingPlans[0], pricingCurrency: 'USD' },
  { ...billingPlans[1], pricingCurrency: 'USD', priceMonthly: 1099 },
];

const magicStoryManifest = {
  ...privateStoryManifests['private-story-magic-audio'],
  audioMetadata: {
    ...privateStoryManifests['private-story-magic-audio'].audioMetadata,
    alignment: { words: [], wordStartTimes: [], wordEndTimes: [] },
  },
};

const approvedChildStoryManifest = {
  ...privateStoryManifests['private-story-child-review'],
  parentReviewStatus: 'approved',
};

const publishedChildStoryManifest = {
  ...approvedChildStoryManifest,
  isPublished: true,
  visibility: 'public',
  publishedSlug: 'private-story-child-review-published',
  shareUrl: 'https://app.wondertales.com/stories/private-story-child-review-published',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function response(body: unknown, status = 200): MockResponse {
  return { body, status };
}

function pngResponse(requiredAuthorization?: string): MockResponse {
  return {
    body: transparentPng,
    contentType: 'image/png',
    requiredAuthorization,
  };
}

function normalizedTarget(target: string): string {
  const url = new URL(target, 'https://e2e.invalid');
  url.searchParams.sort();
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

function key(method: string, target: string): string {
  return `${method.toUpperCase()} ${normalizedTarget(target)}`;
}

function pagination(stories: unknown[], total = stories.length) {
  return { status: 'success', stories, pagination: { limit: 24, offset: 0, total } };
}

function childModeControls(settings = defaultChildModeSettings) {
  return {
    childModeEnabled: true,
    childModeSettings: settings,
    childModePasscodeConfigured: true,
    activeSessionCount: 0,
  };
}

function childProfile(
  settings = defaultChildModeSettings,
  storyCreationMode: 'instant' | 'artisan' = 'artisan'
) {
  return {
    ...testChildProfile,
    storyCreationMode,
    childModeSettings: settings,
    childMode: childModeControls(settings),
  };
}

function childrenResponse(
  settings = defaultChildModeSettings,
  storyCreationMode: 'instant' | 'artisan' = 'artisan'
) {
  return {
    status: 'success',
    children: [childProfile(settings, storyCreationMode)],
    limit: 5,
    canCreateMore: true,
  };
}

function currentChildModeDefinition(settings: typeof defaultChildModeSettings): MockDefinition {
  return {
    method: 'GET',
    target: '/api/v1/children/child-mode/current',
    responses: [
      response({
        status: 'success',
        childMode: {
          childModeEnabled: true,
          childModeSettings: settings,
        },
      }),
    ],
  };
}

function plansResponse(
  plans: typeof billingPlans,
  billingCurrency: 'EUR' | 'USD',
  preferredBillingCurrency: 'EUR' | 'USD'
) {
  return {
    status: 'success',
    plans,
    enableRealPayments: true,
    billingCurrency,
    preferredBillingCurrency,
    supportedBillingCurrencies: ['EUR', 'USD'],
  };
}

function staticDefinitions(): MockDefinition[] {
  const definitions: MockDefinition[] = [];
  const add = (
    method: ApiMethod,
    target: string,
    body: unknown,
    status = 200,
    moreResponses: MockResponse[] = []
  ) => definitions.push({ method, target, responses: [response(body, status), ...moreResponses] });

  add('GET', '/api/v1/me', { status: 'success', user: testUser });
  add('PATCH', '/api/v1/me', { status: 'success', user: testUser });
  add('PATCH', '/api/v1/me/child-mode-exit-passcode', {
    status: 'success',
    user: { ...testUser, childModeExitPasscodeConfigured: true },
    childModeExitPasscode: { configured: true, setAt: '2026-07-10T10:00:00.000Z' },
  });
  add('POST', '/api/v1/auth/parent-gate', {
    status: 'success',
    token: 'e2e-parent-token-from-gate',
    sessionMode: 'parent',
    user: testUser,
  });
  add('POST', '/api/v1/auth/child-mode/recovery', {
    status: 'success',
    message: 'Recovery email sent',
  });
  add('POST', '/api/v1/auth/child-mode/recovery/complete', {
    status: 'success',
    token: 'e2e-parent-token-from-recovery',
    sessionMode: 'parent',
    user: testUser,
    expiresAt: Date.parse('2026-07-10T18:00:00.000Z'),
    childModeExitPasscodeResetToken: 'e2e-exit-passcode-reset-token',
  });

  add('GET', '/api/v1/dictionaries/story-themes?locale=en', {
    status: 'success',
    data: storyThemes,
  });
  add('GET', '/api/v1/me/subscription-usage', {
    status: 'success',
    data: subscriptionUsage,
  });
  add('GET', '/api/v1/entitlements', {
    status: 'success',
    features: { characters_per_month: { used: 1, limit: 10, remaining: 9 } },
  });

  add('GET', '/api/v1/children', childrenResponse());
  add('POST', '/api/v1/children', {
    status: 'success',
    child: {
      ...testChild,
      id: 'child-e2e-onboarded',
      name: 'Nina',
      birthDate: '2020-01-01',
      storyCreationMode: 'artisan',
      childMode: {
        childModeEnabled: false,
        childModeSettings: defaultChildModeSettings,
        activeSessionCount: 0,
      },
    },
  });
  add('GET', '/api/v1/children/child-mode/switcher', {
    status: 'success',
    children: [childProfile()],
  });
  add('GET', '/api/v1/children/child-mode/current', {
    status: 'success',
    childMode: {
      childModeEnabled: true,
      childModeSettings: defaultChildModeSettings,
    },
  });
  add('GET', `/api/v1/children/${testChild.id}/child-mode`, {
    status: 'success',
    childMode: childModeControls(),
  });
  add('PATCH', `/api/v1/children/${testChild.id}/child-mode`, {
    status: 'success',
    childMode: childModeControls(),
  });
  add('POST', `/api/v1/children/${testChild.id}/child-mode/sessions`, {
    status: 'success',
    token: 'e2e-child-token-from-parent',
    expiresAt: Date.parse('2026-07-10T18:00:00.000Z'),
    child: childProfile(),
    session: {
      id: 'child-session-e2e-1',
      mode: 'child',
      parentUserId: testUser.id,
      childProfileId: testChild.id,
      scopes: ['child_mode'],
      expiresAt: '2026-07-10T18:00:00.000Z',
    },
    childMode: childModeControls(),
  });
  add('DELETE', `/api/v1/children/${testChild.id}/child-mode/sessions`, {
    status: 'success',
    revokedCount: 1,
  });

  add('GET', '/api/v1/characters', { status: 'success', characters: [testCharacter] });
  add('POST', '/api/v1/characters', { status: 'success', character: createdCharacter });
  add('PATCH', `/api/v1/characters/${testCharacter.id}`, {
    status: 'success',
    character: updatedCharacter,
  });
  add('DELETE', `/api/v1/characters/${testCharacter.id}`, { status: 'success' });

  add('GET', '/api/v1/me/stories/languages', {
    status: 'success',
    languages: ['en', 'es'],
  });
  add('GET', '/api/v1/me/stories/quiz-candidate', { status: 'success', candidate: null });
  add('GET', '/api/v1/me/stories?limit=20&offset=0&view=summary', pagination(privateStories));
  add('GET', '/api/v1/me/stories?limit=24&offset=0&view=summary', pagination(privateStories));
  add(
    'GET',
    '/api/v1/me/stories?limit=24&offset=0&view=summary&has_audio=true',
    pagination([privateStories[0]], 1)
  );
  add(
    'GET',
    '/api/v1/me/stories?limit=24&offset=0&view=summary&scenario_card_id=space_odyssey',
    pagination([privateStories[2]], 1)
  );
  add(
    'GET',
    '/api/v1/me/stories?limit=24&offset=0&view=summary&scenario_card_id=space_odyssey&language=es',
    pagination([privateStories[2]], 1)
  );

  add('GET', '/api/v1/public/stories?limit=24&offset=0', pagination(publicStories));
  add(
    'GET',
    '/api/v1/public/stories?limit=24&offset=0&has_audio=true',
    pagination([publicStories[0], publicStories[2]], 2)
  );
  add(
    'GET',
    '/api/v1/public/stories?limit=24&offset=0&age_group=6-7',
    pagination([publicStories[1]], 1)
  );
  add(
    'GET',
    '/api/v1/public/stories?limit=24&offset=0&language=es&age_group=6-7',
    pagination([publicStories[1]], 1)
  );
  add(
    'GET',
    '/api/v1/public/stories?limit=24&offset=0&language=es&age_group=6-7&reading_time_min=6&reading_time_max=10',
    pagination([publicStories[1]], 1)
  );
  for (const story of publicStories) {
    add('GET', `/api/v1/public/stories/${story.publishedSlug}`, {
      status: 'success',
      story,
    });
  }

  add('GET', '/api/v1/me/series', { status: 'success', series: [] });
  add('GET', '/api/v1/me/map-tiles', { status: 'success', tiles: [] });
  add('GET', '/api/v1/me/artifacts?locale=en', { status: 'success', artifacts: [] });
  add('GET', `/api/v1/me/artifacts?childProfileId=${testChild.id}&locale=en`, {
    status: 'success',
    artifacts: [],
  });
  add('GET', '/api/v1/me/privacy-requests', { status: 'success', data: [] });

  for (const storyId of Object.keys(privateStoryManifests)) {
    const manifest =
      storyId === 'private-story-magic-audio'
        ? magicStoryManifest
        : privateStoryManifests[storyId as keyof typeof privateStoryManifests];
    add('GET', `/api/v1/me/stories/${storyId}`, { status: 'success', manifest });
    add('GET', `/api/v1/stories/${storyId}/manifest`, { status: 'success', manifest });
    add('GET', `/api/v1/stories/${storyId}/generation-status`, {
      status: 'success',
      generationStatus: {
        storyId,
        imageGenerationComplete: manifest.imageGenerationComplete,
        sceneIdsWithImages: manifest.sceneIdsWithImages,
        failedScenes: manifest.failedScenes,
      },
    });
    add('GET', `/api/v1/stories/${storyId}/schedule`, { status: 'success', data: null });
    add('GET', `/api/v1/stories/${storyId}/series`, { status: 'success', data: null });
    add('GET', `/api/v1/me/map-tiles/story/${storyId}`, {
      status: 'success',
      generated: null,
      collected: null,
    });
    add('GET', `/api/v1/me/map-tiles/story/${storyId}?child_profile_id=${testChild.id}`, {
      status: 'success',
      generated: null,
      collected: null,
    });
  }

  add('GET', '/api/v1/stories/private-story-magic-audio/audio', {
    status: 'success',
    data: {
      audioUrl: '/api/v1/assets/e2e/story-audio.mp3',
      duration: 32,
      voice: null,
      metadata: null,
    },
  });
  add('POST', '/api/v1/stories/private-story-magic-audio/alignment', {
    status: 'success',
    message: 'Alignment already available',
    alignment: { wordCount: 0, averageConfidence: 1, provider: 'e2e' },
  });
  add('GET', '/api/v1/voices?language=en', {
    status: 'success',
    data: [],
    meta: { userPlan: 'free', hasPremiumAccess: false },
  });

  add('GET', '/api/v1/plans?locale=en&currency=EUR', plansResponse(billingPlans, 'EUR', 'EUR'));
  add('GET', '/api/v1/plans?locale=en&currency=USD', plansResponse(usdBillingPlans, 'USD', 'USD'));
  add('GET', '/api/v1/plans/with-features?locale=en', plansResponse(billingPlans, 'EUR', 'EUR'));
  add(
    'GET',
    '/api/v1/plans/with-features?locale=en&currency=EUR',
    plansResponse(billingPlans, 'EUR', 'EUR')
  );
  add(
    'GET',
    '/api/v1/plans/with-features?locale=en&currency=USD',
    plansResponse(usdBillingPlans, 'USD', 'USD')
  );
  add('PUT', '/api/v1/plans/billing-currency', {
    status: 'success',
    preferredBillingCurrency: 'USD',
  });
  add('GET', '/api/v1/bundles?currency=EUR', { status: 'success', bundles: [] });
  add('GET', '/api/v1/bundles?currency=USD', { status: 'success', bundles: [] });
  add('POST', '/api/v1/billing/checkout-session', {
    status: 'success',
    sessionId: 'checkout-session-e2e-1',
    url: '/billing/success?session_id=checkout-session-e2e-1',
  });
  add('POST', '/api/v1/billing/portal-session', {
    status: 'success',
    url: '/profile?portal=returned',
  });

  add('POST', '/api/v1/upload/photo', {
    status: 'success',
    photo: {
      url: '/api/v1/assets/e2e-uploaded-photo.png',
      storagePath: 'e2e/uploaded-photo.png',
      uploadedAt: '2026-07-10T10:00:00.000Z',
    },
  });
  add('POST', '/api/v1/feedback', {
    status: 'success',
    feedback: {
      id: 'feedback-e2e-1',
      contentReview: { reviewQueued: true, reason: 'e2e_mock' },
    },
  });

  for (const target of [
    '/api/v1/stories/instant',
    '/api/v1/stories',
    '/api/v1/stories/child-mode',
    '/api/v1/graphic-novels',
    '/api/v1/mixed-stories',
  ]) {
    add('POST', target, { status: 'success', request: { id: 'request-e2e-1' } });
  }
  add('GET', '/api/v1/stories/requests/request-e2e-1/status', {
    status: 'success',
    request: {
      id: 'request-e2e-1',
      status: 'completed',
      progress: 100,
      storyId: 'private-story-magic-audio',
    },
  });

  add('PATCH', '/api/v1/stories/private-story-child-review/parent-review', {
    status: 'success',
    story: { id: 'private-story-child-review', parentReviewStatus: 'approved' },
  });
  add('PATCH', '/api/v1/stories/private-story-child-review', {
    status: 'success',
    slug: 'private-story-child-review-published',
    shareUrl: 'https://app.wondertales.com/stories/private-story-child-review-published',
    publishedStoriesCount: 1,
  });

  return definitions;
}

function scenarioDefinitions(scenario: ApiMockScenario): MockDefinition[] {
  if (scenario === 'admin-validation-analytics') {
    const adminUser = { ...testUser, role: 'admin' };
    return [
      {
        method: 'GET',
        target: '/api/v1/me',
        responses: [response({ status: 'success', user: adminUser })],
      },
      {
        method: 'GET',
        target: '/api/v1/admin/image-validations?limit=20&offset=0',
        responses: [
          response({
            status: 'success',
            data: { items: [], meta: { limit: 20, offset: 0, total: 0 } },
          }),
        ],
      },
      {
        method: 'GET',
        target: '/api/v1/admin/image-validations/analytics/character-regenerations',
        responses: [
          response({
            status: 'success',
            data: {
              totals: {
                validationRows: 12,
                imageTargets: 4,
                excludedImageTargets: 0,
                totalGenerations: 8,
                totalRegenerations: 4,
                retriedImageTargets: 3,
                retryRate: 0.75,
                pearsonCorrelation: 0.8528,
              },
              buckets: [
                {
                  characterCount: 1,
                  imageTargets: 1,
                  totalGenerations: 1,
                  totalRegenerations: 0,
                  averageRegenerations: 0,
                  retryRate: 0,
                },
                {
                  characterCount: 2,
                  imageTargets: 1,
                  totalGenerations: 2,
                  totalRegenerations: 1,
                  averageRegenerations: 1,
                  retryRate: 1,
                },
                {
                  characterCount: 3,
                  imageTargets: 2,
                  totalGenerations: 5,
                  totalRegenerations: 3,
                  averageRegenerations: 1.5,
                  retryRate: 1,
                },
              ],
              distribution: [
                { characterCount: 1, regenerations: 0, imageTargets: 1 },
                { characterCount: 2, regenerations: 1, imageTargets: 1 },
                { characterCount: 3, regenerations: 1, imageTargets: 1 },
                { characterCount: 3, regenerations: 2, imageTargets: 1 },
              ],
            },
          }),
        ],
      },
    ];
  }

  if (scenario === 'admin-validation-bbox') {
    const validationId = '1588b77c-aace-416a-9adf-9dfd3ff3f495';
    const adminUser = { ...testUser, role: 'admin' };
    return [
      {
        method: 'GET',
        target: '/api/v1/me',
        responses: [response({ status: 'success', user: adminUser })],
      },
      {
        method: 'GET',
        target: `/api/v1/admin/image-validations/${validationId}`,
        responses: [
          response({
            status: 'success',
            data: {
              id: validationId,
              storyId: 'story-e2e-validation',
              sceneIndex: 1,
              attempt: 1,
              imageStoragePath: 'stories/story-e2e-validation/scene-1.png',
              imageUrl: `/api/v1/admin/image-validations/${validationId}/image`,
              validationScore: 92,
              validationStatus: 'passed',
              visionModel: 'gemini-image',
              requestManifest: {},
              providerError: null,
              result: {
                layoutFeedback: 'expected composition',
                characters: [
                  {
                    name: 'Emilia',
                    found: true,
                    duplicated: false,
                    characterBoundingBox: {
                      found: true,
                      xMin: 110,
                      yMin: 150,
                      xMax: 375,
                      yMax: 620,
                      confidence: 100,
                      visibility: 'partial_body',
                      notes: 'A girl is leaning out of the ship hatch.',
                    },
                    characterCropRect: {
                      left: 112,
                      top: 85,
                      width: 272,
                      height: 270,
                    },
                  },
                ],
              },
              usage: null,
              createdAt: '2026-07-26T10:00:00.000Z',
            },
          }),
        ],
      },
      {
        method: 'GET',
        target: `/api/v1/admin/image-validations/${validationId}/image`,
        responses: [pngResponse('Bearer e2e-parent-token')],
      },
    ];
  }

  if (scenario === 'onboarding') {
    return [
      {
        method: 'GET',
        target: '/api/v1/me',
        responses: [
          response({ status: 'success', user: { ...testUser, onboardingCompleted: false } }),
        ],
      },
      {
        method: 'PATCH',
        target: '/api/v1/me',
        responses: [
          response({
            status: 'success',
            user: { ...testUser, mode: 'artisan', onboardingCompleted: true },
          }),
        ],
      },
    ];
  }

  if (scenario === 'character-create') {
    return [
      {
        method: 'GET',
        target: '/api/v1/characters',
        responses: [
          response({ status: 'success', characters: [testCharacter] }),
          response({ status: 'success', characters: [testCharacter, createdCharacter] }),
        ],
      },
    ];
  }

  if (scenario === 'character-edit-delete') {
    return [
      {
        method: 'GET',
        target: '/api/v1/characters',
        responses: [
          response({ status: 'success', characters: [testCharacter] }),
          response({ status: 'success', characters: [updatedCharacter] }),
          response({ status: 'success', characters: [] }),
        ],
      },
    ];
  }

  if (scenario === 'child-controls-update') {
    const settings = [
      { ...defaultChildModeSettings, publicStoriesEnabled: false },
      {
        ...defaultChildModeSettings,
        publicStoriesEnabled: false,
        freeTextPromptsEnabled: false,
      },
      {
        ...defaultChildModeSettings,
        publicStoriesEnabled: false,
        freeTextPromptsEnabled: false,
        parentReviewRequired: true,
      },
      {
        ...defaultChildModeSettings,
        publicStoriesEnabled: false,
        freeTextPromptsEnabled: false,
        parentReviewRequired: true,
        allowedLanguageCodes: ['es'],
      },
      {
        ...defaultChildModeSettings,
        publicStoriesEnabled: false,
        freeTextPromptsEnabled: false,
        parentReviewRequired: true,
        allowedLanguageCodes: ['es'],
        allowedThemeSlugs: ['kindness'],
      },
      {
        ...defaultChildModeSettings,
        publicStoriesEnabled: false,
        freeTextPromptsEnabled: false,
        parentReviewRequired: true,
        allowedLanguageCodes: ['es'],
        allowedThemeSlugs: ['kindness'],
        allowedCharacterIds: [testCharacter.id],
      },
    ];
    return [
      {
        method: 'PATCH',
        target: `/api/v1/children/${testChild.id}/child-mode`,
        responses: settings.map((item) =>
          response({ status: 'success', childMode: childModeControls(item) })
        ),
      },
      {
        method: 'GET',
        target: '/api/v1/children',
        responses: [
          response(childrenResponse()),
          response(childrenResponse()),
          ...settings.map((item) => response(childrenResponse(item))),
        ],
      },
    ];
  }

  if (scenario === 'story-review-publish') {
    return [
      {
        method: 'GET',
        target: '/api/v1/me/stories/private-story-child-review',
        responses: [
          response({ status: 'success', manifest: approvedChildStoryManifest }),
          response({ status: 'success', manifest: publishedChildStoryManifest }),
        ],
      },
      {
        method: 'GET',
        target: '/api/v1/stories/private-story-child-review/manifest',
        responses: [
          response({
            status: 'success',
            manifest: privateStoryManifests['private-story-child-review'],
          }),
          response({ status: 'success', manifest: approvedChildStoryManifest }),
          response({ status: 'success', manifest: publishedChildStoryManifest }),
        ],
      },
    ];
  }

  if (scenario === 'story-continuation-retry') {
    return [
      {
        method: 'GET',
        target: '/api/v1/voices?language=en',
        responses: [
          response({
            status: 'success',
            data: [],
            meta: { userPlan: 'golden', hasPremiumAccess: true },
          }),
        ],
      },
      {
        method: 'GET',
        target: '/api/v1/voices?language=es',
        responses: [
          response({
            status: 'success',
            data: [],
            meta: { userPlan: 'golden', hasPremiumAccess: true },
          }),
        ],
      },
      {
        method: 'POST',
        target: '/api/v1/stories/private-story-magic-audio/continue',
        responses: [
          response({
            status: 'success',
            request: {
              id: 'continuation-e2e-failed',
              status: 'pending',
              progress: 0,
              createdAt: '2026-07-17T10:00:00.000Z',
            },
          }),
          response({
            status: 'success',
            request: {
              id: 'continuation-e2e-retry',
              status: 'pending',
              progress: 0,
              createdAt: '2026-07-17T10:01:00.000Z',
            },
          }),
        ],
      },
      {
        method: 'GET',
        target: '/api/v1/stories/requests/continuation-e2e-failed/status',
        responses: [
          response({
            status: 'success',
            request: {
              id: 'continuation-e2e-failed',
              status: 'failed',
              progress: 35,
              errorMessage: 'A retryable generation failure occurred.',
            },
          }),
        ],
      },
      {
        method: 'GET',
        target: '/api/v1/stories/requests/continuation-e2e-retry/status',
        responses: [
          response({
            status: 'success',
            request: {
              id: 'continuation-e2e-retry',
              status: 'processing',
              progress: 58,
              progressData: {
                overallProgress: 58,
                activeTasks: [{ task: 'generating_text' }],
                completedTasks: [],
                plannedTasks: [],
              },
            },
          }),
          response({
            status: 'success',
            request: {
              id: 'continuation-e2e-retry',
              status: 'completed',
              progress: 100,
              storyId: 'private-story-space',
            },
          }),
        ],
      },
    ];
  }

  if (scenario === 'child-series-allowed') {
    return [
      {
        method: 'GET',
        target: '/api/v1/children/child-mode/current',
        responses: [
          response({
            status: 'success',
            childMode: {
              childModeEnabled: true,
              childModeSettings: {
                ...defaultChildModeSettings,
                publicStoriesEnabled: false,
                allowSharedFamilyStories: true,
              },
            },
          }),
        ],
      },
    ];
  }

  if (scenario === 'child-series-denied') {
    return [
      {
        method: 'GET',
        target: '/api/v1/children/child-mode/current',
        responses: [
          response({
            status: 'success',
            childMode: {
              childModeEnabled: true,
              childModeSettings: {
                ...defaultChildModeSettings,
                allowSharedFamilyStories: false,
              },
            },
          }),
        ],
      },
    ];
  }

  if (scenario === 'child-wizard-restricted') {
    return [
      {
        method: 'GET',
        target: '/api/v1/children/child-mode/current',
        responses: [
          response({
            status: 'success',
            childMode: {
              childModeEnabled: true,
              childModeSettings: {
                ...defaultChildModeSettings,
                allowedLanguageCodes: ['es'],
                allowedThemeSlugs: ['kindness'],
                allowedCharacterIds: [testCharacter.id],
              },
            },
          }),
        ],
      },
    ];
  }

  if (scenario === 'parent-mode-switch-instant') {
    const artisanUser = { ...testUser, mode: 'artisan' };
    const instantUser = { ...testUser, mode: 'instant' };
    return [
      {
        method: 'GET',
        target: '/api/v1/me',
        responses: [
          response({ status: 'success', user: artisanUser }),
          response({ status: 'success', user: instantUser }),
        ],
      },
      {
        method: 'PATCH',
        target: '/api/v1/me',
        responses: [response({ status: 'success', user: instantUser })],
      },
    ];
  }

  if (scenario === 'child-mode-switch-instant') {
    const instantChild = childProfile(defaultChildModeSettings, 'instant');
    return [
      {
        method: 'GET',
        target: '/api/v1/children',
        responses: [
          response(childrenResponse(defaultChildModeSettings, 'artisan')),
          response(childrenResponse(defaultChildModeSettings, 'instant')),
        ],
      },
      {
        method: 'PATCH',
        target: `/api/v1/children/${testChild.id}`,
        responses: [response({ status: 'success', child: instantChild })],
      },
      {
        method: 'POST',
        target: `/api/v1/children/${testChild.id}/child-mode/sessions`,
        responses: [
          response({
            status: 'success',
            token: 'e2e-child-token-after-mode-switch',
            expiresAt: Date.parse('2026-07-20T18:00:00.000Z'),
            child: instantChild,
            session: {
              id: 'child-session-e2e-mode-switch',
              mode: 'child',
              parentUserId: testUser.id,
              childProfileId: testChild.id,
              scopes: ['child_mode'],
              expiresAt: '2026-07-20T18:00:00.000Z',
            },
            childMode: childModeControls(),
          }),
        ],
      },
    ];
  }

  const childSettingsByScenario: Partial<Record<ApiMockScenario, typeof defaultChildModeSettings>> =
    {
      'child-story-generation-disabled': {
        ...defaultChildModeSettings,
        storyGenerationEnabled: false,
      },
      'child-continuation-disabled': {
        ...defaultChildModeSettings,
        storyContinuationEnabled: false,
      },
      'child-public-stories-allowed': {
        ...defaultChildModeSettings,
        publicStoriesEnabled: true,
      },
      'child-public-stories-denied': {
        ...defaultChildModeSettings,
        publicStoriesEnabled: false,
      },
      'child-free-text-disabled': {
        ...defaultChildModeSettings,
        freeTextPromptsEnabled: false,
      },
      'child-audio-disabled': {
        ...defaultChildModeSettings,
        audioGenerationEnabled: false,
      },
      'child-quiz-disabled': {
        ...defaultChildModeSettings,
        quizGenerationEnabled: false,
      },
      'child-siblings-allowed': {
        ...defaultChildModeSettings,
        allowSiblingCharacters: true,
      },
      'child-siblings-denied': {
        ...defaultChildModeSettings,
        allowSiblingCharacters: false,
      },
      'child-parent-review-required': {
        ...defaultChildModeSettings,
        parentReviewRequired: true,
      },
    };
  const childSettings = childSettingsByScenario[scenario];
  if (childSettings) {
    const definitions = [currentChildModeDefinition(childSettings)];
    if (scenario === 'child-siblings-allowed' || scenario === 'child-siblings-denied') {
      definitions.push({
        method: 'GET',
        target: '/api/v1/characters',
        responses: [response({ status: 'success', characters: [testCharacter, siblingCharacter] })],
      });
    }
    return definitions;
  }

  if (scenario === 'billing-usd' || scenario === 'default') return [];
  return [];
}

async function fulfillJson(route: Route, mockResponse: MockResponse) {
  await route.fulfill({
    status: mockResponse.status ?? 200,
    contentType: 'application/json',
    body: JSON.stringify(clone(mockResponse.body)),
  });
}

async function fulfillPng(route: Route, mockResponse?: MockResponse) {
  await route.fulfill({
    status: mockResponse?.status ?? 200,
    contentType: 'image/png',
    body: Buffer.isBuffer(mockResponse?.body) ? mockResponse.body : transparentPng,
  });
}

async function fulfillMockResponse(route: Route, mockResponse: MockResponse) {
  if (
    mockResponse.requiredAuthorization &&
    route.request().headers().authorization !== mockResponse.requiredAuthorization
  ) {
    await fulfillJson(
      route,
      response({ status: 'error', message: 'Invalid E2E authorization token' }, 401)
    );
    return;
  }

  if (mockResponse.contentType === 'image/png') {
    await fulfillPng(route, mockResponse);
    return;
  }

  await fulfillJson(route, mockResponse);
}

export async function installApiMocks(
  page: Page,
  scenario: ApiMockScenario = 'default'
): Promise<ApiMockController> {
  const definitions = new Map<string, MockResponse[]>();
  for (const definition of [...staticDefinitions(), ...scenarioDefinitions(scenario)]) {
    definitions.set(key(definition.method, definition.target), definition.responses);
  }

  const callCounts = new Map<string, number>();
  const unexpectedRequests: string[] = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname.startsWith('/api/v1/assets/') || pathname.includes('/landing/topics/')) {
      await fulfillPng(route);
      return;
    }

    if (!pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    const requestKey = key(request.method(), `${pathname}${url.search}`);
    const responses = definitions.get(requestKey);
    if (!responses) {
      unexpectedRequests.push(requestKey);
      await fulfillJson(
        route,
        response({ status: 'error', message: `Unexpected E2E API request: ${requestKey}` }, 500)
      );
      return;
    }

    const callIndex = callCounts.get(requestKey) ?? 0;
    callCounts.set(requestKey, callIndex + 1);
    await fulfillMockResponse(route, responses[Math.min(callIndex, responses.length - 1)]);
  });

  return {
    assertNoUnexpectedRequests() {
      if (unexpectedRequests.length > 0) {
        throw new Error(
          `Unexpected E2E API request(s):\n${Array.from(new Set(unexpectedRequests)).join('\n')}`
        );
      }
    },
  };
}
