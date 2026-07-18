import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

// This file covers the two directly-callable HTTP endpoints in the instant
// analyze chain: POST /characters/analyze (operation `character_analysis`) and
// POST /children/analyze (operations `image_validation_child_photo` then
// `character_analysis`). Face-dedup, turnaround, and the story pipeline itself
// run later inside the async `instant_character_setup` job worker, which is
// covered at the domain/service test layer (faceDeduplicationService,
// turnaroundSheetService, characterAnalysisService) and not re-verified here;
// the HTTP-visible `/stories/instant` queue hookup is already covered by
// childModeGenerationHttpContract.test.ts.

const userId = '81111111-1111-4111-8111-111111111111';
const parentSessionId = '82222222-2222-4222-8222-222222222221';
const childSessionId = '82222222-2222-4222-8222-222222222222';
const scopelessChildSessionId = '82222222-2222-4222-8222-222222222223';
const childProfileId = '83333333-3333-4333-8333-333333333333';

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
  const { installAiServiceTestOverrides, clearAiServiceTestOverrides } =
    await import('../../services/aiService');
  const { installAssetStorageServiceTestOverride, clearAssetStorageServiceTestOverride } =
    await import('../../services/assetStorageService');
  const { MockTextProvider } = await import('../../testing/ai/MockTextProvider');
  const { MOCK_CHARACTER_ANALYSIS, MOCK_CHILD_PHOTO_VALIDATION } =
    await import('../../testing/ai/fixtures');

  const now = new Date();
  const user = {
    id: userId,
    email: 'instant-analyze-contract@example.test',
    displayName: 'Instant Analyze Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
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
  const childSession = {
    ...parentSession,
    id: childSessionId,
    mode: 'child',
    childProfileId,
    scopes: ['child_mode'],
    token: 'child-repository-token',
  } as any;
  const scopelessChildSession = {
    ...childSession,
    id: scopelessChildSessionId,
    scopes: [],
    token: 'scopeless-child-repository-token',
  } as any;
  const sessionsById = new Map<string, any>([
    [parentSessionId, parentSession],
    [childSessionId, childSession],
    [scopelessChildSessionId, scopelessChildSession],
  ]);

  const subscription = {
    id: '84444444-4444-4444-8444-444444444444',
    userId,
    planId: '85555555-5555-4555-8555-555555555555',
    status: 'active',
  } as any;
  const featureValues = new Map<string, unknown>([
    ['story_from_drawing', { enabled: true }],
  ]);

  let childDataConsentOnFile = false;
  const recordedConsents: any[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (sessionId: string) => {
        const session = sessionsById.get(sessionId);
        return session ? { session, user } : null;
      },
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
    plan: {
      findSubscriptionByUserId: async () => subscription,
      findFeatureValue: async (_planId: string, slug: string) => featureValues.get(slug) ?? null,
    } as any,
    userConsent: {
      record: async (input: any) => {
        recordedConsents.push(input);
        childDataConsentOnFile = true;
      },
      hasVersion: async () => childDataConsentOnFile,
    } as any,
  });

  installAssetStorageServiceTestOverride({
    getAssetByPath: async () => Buffer.from('mock-photo-bytes'),
  } as any);

  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;
  const scopelessChildAuthorization = `Bearer ${generateToken({ userId, sessionId: scopelessChildSessionId })}`;

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const post = (path: string, body: unknown, authorization: string) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const characterPhoto = `/api/v1/assets/test/${userId}/photos/character/photo.jpg`;
  const childPhoto = `/api/v1/assets/test/${userId}/photos/child/photo.jpg`;

  try {
    // 1. Happy path: person character analysis maps into humanAppearance.
    {
      const textProvider = new MockTextProvider().queueStructured('character_analysis', {
        ...MOCK_CHARACTER_ANALYSIS,
        appearanceTraits: { age: 'child', hairColor: 'red', eyeColor: 'green', bodyType: 'average' },
        clothing: { style: 'casual' },
      });
      installAiServiceTestOverrides({ textProvider });

      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [characterPhoto], characterType: 'person', language: 'en' },
        parentAuthorization
      );
      assert.equal(response.status, 200, 'person character analysis succeeds');
      const body = (await response.json()) as any;
      assert.equal(body.status, 'success');
      assert.equal(body.analysis.humanAppearance.ageRange, 'child');
      assert.equal(body.analysis.humanAppearance.hairColor, 'red');
      assert.equal(body.analysis.humanAppearance.eyeColor, 'green');
      assert.equal(body.analysis.humanAppearance.clothingStyle, 'casual');
      textProvider.assertExhausted();
      clearAiServiceTestOverrides();
    }

    // 2. Happy path: animal character analysis maps into petAppearance.
    {
      const textProvider = new MockTextProvider().queueStructured('character_analysis', {
        ...MOCK_CHARACTER_ANALYSIS,
        appearanceTraits: { breed: 'labrador', furColor: 'golden', size: 'medium' },
      });
      installAiServiceTestOverrides({ textProvider });

      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [characterPhoto], characterType: 'animal', language: 'en' },
        parentAuthorization
      );
      assert.equal(response.status, 200, 'animal character analysis succeeds');
      const body = (await response.json()) as any;
      assert.equal(body.analysis.petAppearance.breed, 'labrador');
      assert.equal(body.analysis.petAppearance.furColor, 'golden');
      textProvider.assertExhausted();
      clearAiServiceTestOverrides();
    }

    // 3. Happy path: imaginary character analysis maps into imaginaryAppearance.
    {
      const textProvider = new MockTextProvider().queueStructured('character_analysis', {
        ...MOCK_CHARACTER_ANALYSIS,
        appearanceTraits: { fantasyType: 'dragon', magicalFeatures: ['glowing scales'] },
      });
      installAiServiceTestOverrides({ textProvider });

      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [characterPhoto], characterType: 'imaginary', language: 'en' },
        parentAuthorization
      );
      assert.equal(response.status, 200, 'imaginary character analysis succeeds');
      const body = (await response.json()) as any;
      assert.equal(body.analysis.imaginaryAppearance.species, 'dragon');
      assert.deepEqual(body.analysis.imaginaryAppearance.magicalFeatures, ['glowing scales']);
      textProvider.assertExhausted();
      clearAiServiceTestOverrides();
    }

    // 4. Validation: missing photos array returns 400 without any AI call.
    {
      installAiServiceTestOverrides({ textProvider: new MockTextProvider() });
      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [], characterType: 'person' },
        parentAuthorization
      );
      assert.equal(response.status, 400, 'empty photos array is rejected');
      clearAiServiceTestOverrides();
    }

    // 5. Validation: invalid characterType returns 400 without any AI call.
    {
      installAiServiceTestOverrides({ textProvider: new MockTextProvider() });
      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [characterPhoto], characterType: 'robot' },
        parentAuthorization
      );
      assert.equal(response.status, 400, 'invalid characterType is rejected');
      clearAiServiceTestOverrides();
    }

    // 6. Child session with child_mode scope can analyze characters.
    {
      const textProvider = new MockTextProvider().queueStructured(
        'character_analysis',
        MOCK_CHARACTER_ANALYSIS
      );
      installAiServiceTestOverrides({ textProvider });
      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [characterPhoto], characterType: 'person' },
        childAuthorization
      );
      assert.equal(response.status, 200, 'scoped child session can analyze characters');
      textProvider.assertExhausted();
      clearAiServiceTestOverrides();
    }

    // 7. Child session missing the child_mode scope is denied.
    {
      installAiServiceTestOverrides({ textProvider: new MockTextProvider() });
      const response = await post(
        '/api/v1/characters/analyze',
        { photos: [characterPhoto], characterType: 'person' },
        scopelessChildAuthorization
      );
      assert.equal(response.status, 403, 'child session without child_mode scope is denied');
      const body = (await response.json()) as any;
      assert.equal(body.code, 'SESSION_SCOPE_REQUIRED');
      clearAiServiceTestOverrides();
    }

    // 8. children/analyze: consent required before any photo validation runs.
    {
      childDataConsentOnFile = false;
      installAiServiceTestOverrides({ textProvider: new MockTextProvider() });
      const response = await post(
        '/api/v1/children/analyze',
        { photos: [childPhoto] },
        parentAuthorization
      );
      assert.equal(response.status, 403, 'missing child data consent is denied');
      const body = (await response.json()) as any;
      assert.equal(body.code, 'CHILD_DATA_CONSENT_REQUIRED');
      clearAiServiceTestOverrides();
    }

    // 9. children/analyze: happy path validates the photo then analyzes it.
    {
      const validationTextProvider = new MockTextProvider().queueStructured(
        'image_validation_child_photo',
        MOCK_CHILD_PHOTO_VALIDATION
      );
      const textProvider = new MockTextProvider().queueStructured('character_analysis', {
        ...MOCK_CHARACTER_ANALYSIS,
        appearanceTraits: { hairColor: 'red', eyeColor: 'green', distinctiveFeatures: ['freckles'] },
      });
      installAiServiceTestOverrides({ textProvider, validationTextProvider });

      const response = await post(
        '/api/v1/children/analyze',
        { photos: [childPhoto], childDataConsentAccepted: true },
        parentAuthorization
      );
      assert.equal(response.status, 200, 'child photo analysis succeeds after consent + validation');
      const body = (await response.json()) as any;
      assert.equal(body.status, 'success');
      assert.equal(body.analysis.appearance.hairColor, 'red');
      assert.equal(body.analysis.appearance.eyeColor, 'green');
      assert.deepEqual(body.analysis.appearance.distinctiveFeatures, ['freckles']);
      validationTextProvider.assertExhausted();
      textProvider.assertExhausted();
      assert.equal(recordedConsents.length, 1);
      assert.equal(recordedConsents[0].userId, userId);
      assert.equal(recordedConsents[0].consentType, 'child_data_processing');
      clearAiServiceTestOverrides();
    }

    // 10. children/analyze: photo rejected as not containing a human returns 400
    // and never reaches character_analysis.
    {
      childDataConsentOnFile = true;
      const validationTextProvider = new MockTextProvider().queueStructured(
        'image_validation_child_photo',
        { ...MOCK_CHILD_PHOTO_VALIDATION, hasHumanSubject: false, humanSubjectCount: 0, primarySubject: 'toy' }
      );
      const textProvider = new MockTextProvider();
      installAiServiceTestOverrides({ textProvider, validationTextProvider });

      const response = await post('/api/v1/children/analyze', { photos: [childPhoto] }, parentAuthorization);
      assert.equal(response.status, 400, 'photo without a clear human subject is rejected');
      const body = (await response.json()) as any;
      assert.equal(body.code, 'CHILD_PHOTO_REQUIRES_HUMAN');
      validationTextProvider.assertExhausted();
      textProvider.assertExhausted();
      clearAiServiceTestOverrides();
    }

    // 11. children/analyze: child sessions are not parent sessions and are denied.
    {
      childDataConsentOnFile = true;
      installAiServiceTestOverrides({ textProvider: new MockTextProvider() });
      const response = await post('/api/v1/children/analyze', { photos: [childPhoto] }, childAuthorization);
      assert.equal(response.status, 403, 'child session cannot call children/analyze');
      const body = (await response.json()) as any;
      assert.equal(body.code, 'PARENT_SESSION_REQUIRED');
      clearAiServiceTestOverrides();
    }
  } finally {
    clearAiServiceTestOverrides();
    clearAssetStorageServiceTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('instant analyze chain HTTP contract passed (11 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
