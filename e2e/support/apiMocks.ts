import type { Page, Request, Route } from '@playwright/test';
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

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requestJson(request: Request) {
  try {
    return request.postDataJSON() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function childModeSettingsFromSnakeCase(
  settings: Record<string, unknown>
): Partial<typeof defaultChildModeSettings> {
  const next: Partial<typeof defaultChildModeSettings> = {};
  if (typeof settings.story_generation_enabled === 'boolean') {
    next.storyGenerationEnabled = settings.story_generation_enabled;
  }
  if (typeof settings.public_stories_enabled === 'boolean') {
    next.publicStoriesEnabled = settings.public_stories_enabled;
  }
  if (
    typeof settings.daily_generation_limit === 'number' ||
    settings.daily_generation_limit === null
  ) {
    next.dailyGenerationLimit = settings.daily_generation_limit;
  }
  if (
    typeof settings.monthly_generation_limit === 'number' ||
    settings.monthly_generation_limit === null
  ) {
    next.monthlyGenerationLimit = settings.monthly_generation_limit;
  }
  if (
    typeof settings.daily_audio_generation_limit === 'number' ||
    settings.daily_audio_generation_limit === null
  ) {
    next.dailyAudioGenerationLimit = settings.daily_audio_generation_limit;
  }
  if (Array.isArray(settings.allowed_theme_slugs)) {
    next.allowedThemeSlugs = settings.allowed_theme_slugs.map(String);
  }
  if (Array.isArray(settings.allowed_language_codes)) {
    next.allowedLanguageCodes = settings.allowed_language_codes.map(String);
  }
  if (Array.isArray(settings.allowed_character_ids)) {
    next.allowedCharacterIds = settings.allowed_character_ids.map(String);
  }
  if (typeof settings.free_text_prompts_enabled === 'boolean') {
    next.freeTextPromptsEnabled = settings.free_text_prompts_enabled;
  }
  if (typeof settings.audio_generation_enabled === 'boolean') {
    next.audioGenerationEnabled = settings.audio_generation_enabled;
  }
  if (typeof settings.quiz_generation_enabled === 'boolean') {
    next.quizGenerationEnabled = settings.quiz_generation_enabled;
  }
  if (typeof settings.parent_review_required === 'boolean') {
    next.parentReviewRequired = settings.parent_review_required;
  }
  if (typeof settings.allow_sibling_characters === 'boolean') {
    next.allowSiblingCharacters = settings.allow_sibling_characters;
  }
  if (typeof settings.allow_shared_family_stories === 'boolean') {
    next.allowSharedFamilyStories = settings.allow_shared_family_stories;
  }
  return next;
}

async function png(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: transparentPng,
  });
}

function paginate<T>(items: T[], url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? 24);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  return {
    items: items.slice(offset, offset + limit),
    pagination: { limit, offset, total: items.length },
  };
}

function filterPrivateStoriesFrom<
  T extends { hasAudio?: boolean; scenarioCardId?: string; language?: string },
>(sourceStories: T[], url: URL) {
  let stories = [...sourceStories];
  if (url.searchParams.get('has_audio') === 'true') {
    stories = stories.filter((story) => story.hasAudio);
  }
  const scenarioCardId = url.searchParams.get('scenario_card_id');
  if (scenarioCardId) {
    stories = stories.filter((story) => story.scenarioCardId === scenarioCardId);
  }
  const language = url.searchParams.get('language');
  if (language) {
    stories = stories.filter((story) => story.language === language);
  }
  return paginate(stories, url);
}

function filterPublicStories(url: URL) {
  let stories = [...publicStories];
  if (url.searchParams.get('has_audio') === 'true') {
    stories = stories.filter((story) => story.hasAudio);
  }
  const scenarioCardId = url.searchParams.get('scenario_card_id');
  if (scenarioCardId) {
    stories = stories.filter((story) => story.scenarioCardId === scenarioCardId);
  }
  const language = url.searchParams.get('language');
  if (language) {
    stories = stories.filter((story) => story.language === language);
  }
  const ageGroup = url.searchParams.get('age_group');
  if (ageGroup) {
    stories = stories.filter((story) => story.ageGroup === ageGroup);
  }
  const readingTimeMin = Number(url.searchParams.get('reading_time_min') ?? Number.NaN);
  if (Number.isFinite(readingTimeMin)) {
    stories = stories.filter((story) => story.readingTimeMinutes >= readingTimeMin);
  }
  const readingTimeMax = Number(url.searchParams.get('reading_time_max') ?? Number.NaN);
  if (Number.isFinite(readingTimeMax)) {
    stories = stories.filter((story) => story.readingTimeMinutes <= readingTimeMax);
  }
  return paginate(stories, url);
}

export async function installApiMocks(page: Page) {
  const storyManifestsById = new Map(
    Object.entries(privateStoryManifests).map(([id, manifest]) => [id, clone(manifest)])
  );
  const charactersById = new Map([[testCharacter.id, clone(testCharacter)]]);
  let nextCharacterIndex = 1;
  let preferredBillingCurrency = 'EUR';
  const childModeControlsById = new Map([
    [
      testChild.id,
      {
        childModeEnabled: true,
        childModeSettings: clone(defaultChildModeSettings),
        childModePasscodeConfigured: true,
        activeSessionCount: 0,
      },
    ],
  ]);
  const childProfileForResponse = () => {
    const controls = childModeControlsById.get(testChild.id)!;
    return {
      ...testChildProfile,
      childModeEnabled: controls.childModeEnabled,
      childModeSettings: clone(controls.childModeSettings),
      childModePasscodeConfigured: controls.childModePasscodeConfigured,
      childModeActiveSessionCount: controls.activeSessionCount,
      childMode: {
        childModeEnabled: controls.childModeEnabled,
        childModeSettings: clone(controls.childModeSettings),
        activeSessionCount: controls.activeSessionCount,
      },
    };
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname.startsWith('/api/v1/assets/') || pathname.includes('/landing/topics/')) {
      await png(route);
      return;
    }

    if (!pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (pathname === '/api/v1/me' && request.method() === 'PATCH') {
      const data = requestJson(request);
      await json(route, {
        status: 'success',
        user: {
          ...testUser,
          mode: typeof data.mode === 'string' ? data.mode : testUser.mode,
          onboardingCompleted:
            typeof data.onboarding_completed === 'boolean'
              ? data.onboarding_completed
              : testUser.onboardingCompleted,
        },
      });
      return;
    }

    if (pathname === '/api/v1/me/child-mode-exit-passcode' && request.method() === 'PATCH') {
      await json(route, {
        status: 'success',
        user: {
          ...testUser,
          childModeExitPasscodeConfigured: true,
        },
        childModeExitPasscode: {
          configured: true,
          setAt: '2026-07-10T10:00:00.000Z',
        },
      });
      return;
    }

    if (pathname === '/api/v1/me') {
      await json(route, { status: 'success', user: testUser });
      return;
    }

    if (pathname === '/api/v1/auth/parent-gate' && request.method() === 'POST') {
      const data = requestJson(request);
      if (data.password === 'wrong-passcode') {
        await json(route, { status: 'error', message: 'Invalid password' }, 401);
        return;
      }
      await json(route, {
        status: 'success',
        token: 'e2e-parent-token-from-gate',
        sessionMode: 'parent',
        user: testUser,
      });
      return;
    }

    if (pathname === '/api/v1/auth/child-mode/recovery' && request.method() === 'POST') {
      await json(route, { status: 'success', message: 'Recovery email sent' });
      return;
    }

    if (pathname === '/api/v1/dictionaries/story-themes') {
      await json(route, { status: 'success', data: storyThemes });
      return;
    }

    if (pathname === '/api/v1/me/subscription-usage') {
      await json(route, { status: 'success', data: subscriptionUsage });
      return;
    }

    if (pathname === '/api/v1/children/child-mode/switcher') {
      await json(route, { status: 'success', children: [childProfileForResponse()] });
      return;
    }

    const childModeControlsMatch = pathname.match(/^\/api\/v1\/children\/([^/]+)\/child-mode$/);
    if (childModeControlsMatch && request.method() === 'GET') {
      const childId = decodeURIComponent(childModeControlsMatch[1]);
      const controls = childModeControlsById.get(childId);
      if (!controls) {
        await json(route, { status: 'error', message: 'Child not found' }, 404);
        return;
      }
      await json(route, { status: 'success', childMode: clone(controls) });
      return;
    }

    if (childModeControlsMatch && request.method() === 'PATCH') {
      const childId = decodeURIComponent(childModeControlsMatch[1]);
      const controls = childModeControlsById.get(childId);
      const data = requestJson(request);
      if (!controls) {
        await json(route, { status: 'error', message: 'Child not found' }, 404);
        return;
      }
      if (typeof data.child_mode_enabled === 'boolean') {
        controls.childModeEnabled = data.child_mode_enabled;
      }
      if (data.child_mode_settings && typeof data.child_mode_settings === 'object') {
        controls.childModeSettings = {
          ...controls.childModeSettings,
          ...childModeSettingsFromSnakeCase(data.child_mode_settings as Record<string, unknown>),
        };
      }
      childModeControlsById.set(childId, controls);
      await json(route, { status: 'success', childMode: clone(controls) });
      return;
    }

    const childModeSessionsMatch = pathname.match(
      /^\/api\/v1\/children\/([^/]+)\/child-mode\/sessions$/
    );
    if (childModeSessionsMatch && request.method() === 'POST') {
      const childId = decodeURIComponent(childModeSessionsMatch[1]);
      const controls = childModeControlsById.get(childId);
      if (!controls) {
        await json(route, { status: 'error', message: 'Child not found' }, 404);
        return;
      }
      controls.activeSessionCount += 1;
      childModeControlsById.set(childId, controls);
      await json(route, {
        status: 'success',
        token: 'e2e-child-token-from-parent',
        expiresAt: Date.parse('2026-07-10T18:00:00.000Z'),
        child: childProfileForResponse(),
        session: {
          id: 'child-session-e2e-1',
          mode: 'child',
          parentUserId: testUser.id,
          childProfileId: childId,
          scopes: ['child_mode'],
          expiresAt: '2026-07-10T18:00:00.000Z',
        },
        childMode: clone(controls),
      });
      return;
    }

    if (childModeSessionsMatch && request.method() === 'DELETE') {
      const childId = decodeURIComponent(childModeSessionsMatch[1]);
      const controls = childModeControlsById.get(childId);
      if (controls) {
        controls.activeSessionCount = 0;
        childModeControlsById.set(childId, controls);
      }
      await json(route, { status: 'success', revokedCount: 1 });
      return;
    }

    if (pathname === '/api/v1/children' && request.method() === 'POST') {
      const data = requestJson(request);
      await json(route, {
        status: 'success',
        child: {
          ...testChild,
          id: 'child-e2e-onboarded',
          name: String(data.name ?? 'Nina'),
          birthDate: data.birthDate ?? '2020-01-01',
          storyCreationMode: data.storyCreationMode ?? 'instant',
          childMode: {
            childModeEnabled: false,
            childModeSettings: defaultChildModeSettings,
            activeSessionCount: 0,
          },
        },
      });
      return;
    }

    if (pathname === '/api/v1/children') {
      await json(route, {
        status: 'success',
        children: [childProfileForResponse()],
        limit: 5,
        canCreateMore: true,
      });
      return;
    }

    if (pathname === '/api/v1/characters' && request.method() === 'GET') {
      await json(route, {
        status: 'success',
        characters: Array.from(charactersById.values()).map((character) => clone(character)),
      });
      return;
    }

    if (pathname === '/api/v1/characters' && request.method() === 'POST') {
      const data = requestJson(request);
      const character = {
        id: `character-e2e-created-${nextCharacterIndex++}`,
        name: String(data.name ?? 'New character'),
        type:
          data.type === 'person' || data.type === 'imaginary' || data.type === 'animal'
            ? data.type
            : 'animal',
        subtype: typeof data.subtype === 'string' ? data.subtype : null,
        description: typeof data.description === 'string' ? data.description : '',
        descriptionLanguage:
          typeof data.descriptionLanguage === 'string' ? data.descriptionLanguage : 'en',
        childProfileId: typeof data.childProfileId === 'string' ? data.childProfileId : null,
        referencePhotos: Array.isArray(data.referencePhotos) ? data.referencePhotos : [],
        turnaroundSheet: null,
        appearanceTraits:
          data.appearanceTraits && typeof data.appearanceTraits === 'object'
            ? data.appearanceTraits
            : null,
        personality:
          data.personality && typeof data.personality === 'object' ? data.personality : null,
      };
      charactersById.set(character.id, character);
      await json(route, { status: 'success', character: clone(character) });
      return;
    }

    const characterMatch = pathname.match(/^\/api\/v1\/characters\/([^/]+)$/);
    if (characterMatch && request.method() === 'PATCH') {
      const characterId = decodeURIComponent(characterMatch[1]);
      const existing = charactersById.get(characterId);
      if (!existing) {
        await json(route, { status: 'error', message: 'Character not found' }, 404);
        return;
      }
      const data = requestJson(request);
      const updated = {
        ...existing,
        ...data,
        id: characterId,
        subtype: typeof data.subtype === 'string' ? data.subtype : (data.subtype ?? null),
      };
      charactersById.set(characterId, updated);
      await json(route, { status: 'success', character: clone(updated) });
      return;
    }

    if (characterMatch && request.method() === 'DELETE') {
      const characterId = decodeURIComponent(characterMatch[1]);
      charactersById.delete(characterId);
      await json(route, { status: 'success' });
      return;
    }

    if (pathname === '/api/v1/entitlements') {
      await json(route, {
        status: 'success',
        features: {
          characters_per_month: { used: 1, limit: 10, remaining: 9 },
        },
      });
      return;
    }

    if (pathname === '/api/v1/me/stories/quiz-candidate') {
      await json(route, { status: 'success', candidate: null });
      return;
    }

    if (pathname === '/api/v1/me/stories/languages') {
      await json(route, { status: 'success', languages: ['en', 'es'] });
      return;
    }

    const storyQuizMatch = pathname.match(/^\/api\/v1\/me\/stories\/([^/]+)\/quiz$/);
    if (storyQuizMatch && request.method() === 'GET') {
      await json(route, { status: 'error', code: 'QUIZ_NOT_GENERATED' }, 404);
      return;
    }

    const privateStoryDetailMatch = pathname.match(/^\/api\/v1\/me\/stories\/([^/]+)$/);
    if (privateStoryDetailMatch && request.method() === 'GET') {
      const storyId = decodeURIComponent(privateStoryDetailMatch[1]);
      const manifest = storyManifestsById.get(storyId);
      if (!manifest) {
        await json(route, { status: 'error', message: 'Story not found' }, 404);
        return;
      }
      await json(route, { status: 'success', manifest: clone(manifest) });
      return;
    }

    const privateStoryManifestMatch = pathname.match(/^\/api\/v1\/stories\/([^/]+)\/manifest$/);
    if (privateStoryManifestMatch && request.method() === 'GET') {
      const storyId = decodeURIComponent(privateStoryManifestMatch[1]);
      const manifest = storyManifestsById.get(storyId);
      if (!manifest) {
        await json(route, { status: 'error', message: 'Story not found' }, 404);
        return;
      }
      await json(route, { status: 'success', manifest: clone(manifest) });
      return;
    }

    const storyGenerationStatusMatch = pathname.match(
      /^\/api\/v1\/stories\/([^/]+)\/generation-status$/
    );
    if (storyGenerationStatusMatch && request.method() === 'GET') {
      const storyId = decodeURIComponent(storyGenerationStatusMatch[1]);
      const manifest = storyManifestsById.get(storyId);
      await json(route, {
        status: 'success',
        generationStatus: {
          storyId,
          imageGenerationComplete: manifest?.imageGenerationComplete ?? true,
          sceneIdsWithImages: manifest?.sceneIdsWithImages ?? [],
          failedScenes: manifest?.failedScenes ?? [],
        },
      });
      return;
    }

    const storyAudioMatch = pathname.match(/^\/api\/v1\/stories\/([^/]+)\/audio$/);
    if (storyAudioMatch && request.method() === 'GET') {
      await json(route, {
        status: 'success',
        data: {
          audioUrl: '/api/v1/assets/e2e/story-audio.mp3',
          duration: 32,
          voice: null,
          metadata: null,
        },
      });
      return;
    }

    const storyAudioStatusMatch = pathname.match(/^\/api\/v1\/stories\/([^/]+)\/audio-status$/);
    if (storyAudioStatusMatch && request.method() === 'GET') {
      await json(route, {
        status: 'success',
        audioMetadata: null,
        audioUrl: null,
        duration: null,
        jobStatus: null,
        queuePosition: null,
        estimatedWaitMs: null,
        processingStartedAt: null,
        estimatedProcessingMs: null,
        activeJobsCount: 0,
        maxConcurrency: 0,
      });
      return;
    }

    const parentReviewMatch = pathname.match(/^\/api\/v1\/stories\/([^/]+)\/parent-review$/);
    if (parentReviewMatch && request.method() === 'PATCH') {
      const storyId = decodeURIComponent(parentReviewMatch[1]);
      const manifest = storyManifestsById.get(storyId);
      const data = requestJson(request);
      const status = data.status === 'rejected' ? 'rejected' : 'approved';
      if (!manifest) {
        await json(route, { status: 'error', message: 'Story not found' }, 404);
        return;
      }
      manifest.parentReviewStatus = status;
      storyManifestsById.set(storyId, manifest);
      await json(route, {
        status: 'success',
        story: { id: storyId, parentReviewStatus: status },
      });
      return;
    }

    const publishStoryMatch = pathname.match(/^\/api\/v1\/stories\/([^/]+)$/);
    if (publishStoryMatch && request.method() === 'PATCH') {
      const storyId = decodeURIComponent(publishStoryMatch[1]);
      const manifest = storyManifestsById.get(storyId);
      const data = requestJson(request);
      const isPublished = data.is_published !== false;
      const visibility = data.visibility === 'public' ? 'public' : 'unlisted';
      if (!manifest) {
        await json(route, { status: 'error', message: 'Story not found' }, 404);
        return;
      }

      manifest.isPublished = isPublished;
      manifest.visibility = isPublished ? visibility : null;
      manifest.publishedSlug =
        isPublished && visibility === 'public' ? `${storyId}-published` : null;
      manifest.shareUrl = isPublished
        ? visibility === 'public'
          ? `https://app.wondertales.com/stories/${storyId}-published`
          : `https://app.wondertales.com/u/share-${storyId}`
        : null;
      manifest.coverAssetId =
        typeof data.cover_asset_id === 'string' ? data.cover_asset_id : manifest.coverAssetId;
      storyManifestsById.set(storyId, manifest);

      await json(route, {
        status: 'success',
        slug: manifest.publishedSlug,
        shareToken: visibility === 'unlisted' ? `share-${storyId}` : undefined,
        shareUrl: manifest.shareUrl,
        publishedStoriesCount: 1,
      });
      return;
    }

    if (pathname === '/api/v1/me/stories') {
      const summaries = privateStories.map((story) => {
        const manifest = storyManifestsById.get(story.id);
        return manifest ? { ...story, parentReviewStatus: manifest.parentReviewStatus } : story;
      });
      const { items, pagination } = filterPrivateStoriesFrom(summaries, url);
      await json(route, { status: 'success', stories: items, pagination });
      return;
    }

    if (pathname === '/api/v1/public/stories') {
      const { items, pagination } = filterPublicStories(url);
      await json(route, { status: 'success', stories: items, pagination });
      return;
    }

    if (pathname.startsWith('/api/v1/public/stories/')) {
      const slug = pathname.split('/').pop();
      const story = publicStories.find((item) => item.publishedSlug === slug) ?? publicStories[0];
      await json(route, { status: 'success', story });
      return;
    }

    if (pathname === '/api/v1/me/series') {
      await json(route, { status: 'success', series: [] });
      return;
    }

    if (pathname === '/api/v1/me/map-tiles') {
      await json(route, { status: 'success', tiles: [] });
      return;
    }

    if (pathname === '/api/v1/me/artifacts') {
      await json(route, { status: 'success', artifacts: [] });
      return;
    }

    if (pathname === '/api/v1/plans' || pathname === '/api/v1/plans/with-features') {
      const requestedCurrency = url.searchParams.get('currency') ?? preferredBillingCurrency;
      const plans = billingPlans.map((plan) => ({
        ...plan,
        pricingCurrency: requestedCurrency,
        priceMonthly:
          requestedCurrency === 'USD' && plan.priceMonthly > 0
            ? Math.round(plan.priceMonthly * 1.1)
            : plan.priceMonthly,
      }));
      await json(route, {
        status: 'success',
        plans,
        enableRealPayments: true,
        billingCurrency: requestedCurrency,
        preferredBillingCurrency,
        supportedBillingCurrencies: ['EUR', 'USD'],
      });
      return;
    }

    if (pathname === '/api/v1/plans/billing-currency' && request.method() === 'PUT') {
      const data = requestJson(request);
      preferredBillingCurrency = data.currency === 'USD' ? 'USD' : 'EUR';
      await json(route, { status: 'success', preferredBillingCurrency });
      return;
    }

    if (pathname === '/api/v1/billing/checkout-session' && request.method() === 'POST') {
      await json(route, {
        status: 'success',
        sessionId: 'checkout-session-e2e-1',
        url: `${url.origin}/billing/success?session_id=checkout-session-e2e-1`,
      });
      return;
    }

    if (pathname === '/api/v1/billing/portal-session' && request.method() === 'POST') {
      await json(route, {
        status: 'success',
        url: `${url.origin}/profile?portal=returned`,
      });
      return;
    }

    if (pathname === '/api/v1/bundles') {
      await json(route, { status: 'success', bundles: [] });
      return;
    }

    if (pathname === '/api/v1/upload/photo' && request.method() === 'POST') {
      await json(route, {
        status: 'success',
        photo: {
          url: '/api/v1/assets/e2e-uploaded-photo.png',
          storagePath: 'e2e/uploaded-photo.png',
          uploadedAt: new Date('2026-07-10T10:00:00.000Z').toISOString(),
        },
      });
      return;
    }

    if (pathname === '/api/v1/feedback' && request.method() === 'POST') {
      await json(route, {
        status: 'success',
        feedback: {
          id: 'feedback-e2e-1',
          contentReview: {
            reviewQueued: true,
            reason: 'e2e_mock',
          },
        },
      });
      return;
    }

    if (
      [
        '/api/v1/stories/instant',
        '/api/v1/stories',
        '/api/v1/stories/child-mode',
        '/api/v1/graphic-novels',
        '/api/v1/mixed-stories',
      ].includes(pathname)
    ) {
      await json(route, { status: 'success', request: { id: 'request-e2e-1' } });
      return;
    }

    if (pathname === '/api/v1/stories/requests/request-e2e-1/status') {
      await json(route, {
        status: 'success',
        request: {
          id: 'request-e2e-1',
          status: 'completed',
          progress: 100,
          storyId: 'private-story-magic-audio',
        },
      });
      return;
    }

    await json(route, { status: 'success' });
  });
}
