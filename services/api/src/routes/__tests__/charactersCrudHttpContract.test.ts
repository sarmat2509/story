import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import {
  createScriptedTransaction,
  createTransactionRunner,
} from '../../testing/scriptedTransaction';
import { MockImageProvider, MockTextProvider, mockGeneratedImage } from '../../testing/ai';

const userId = 'd1111111-1111-4111-8111-111111111111';
const sessionId = 'd2222222-2222-4222-8222-222222222222';
const childSessionId = 'd2222222-2222-4222-8222-222222222223';
const childProfileId = 'd2222222-2222-4222-8222-222222222224';
const characterId = 'd3333333-3333-4333-8333-333333333331';
const usedCharacterId = 'd3333333-3333-4333-8333-333333333332';
const createdCharacterId = 'd3333333-3333-4333-8333-333333333333';
const childCreatedCharacterId = 'd3333333-3333-4333-8333-333333333334';
const missingCharacterId = 'd9999999-9999-4999-8999-999999999999';
const planId = 'd5555555-5555-4555-8555-555555555555';

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

  const schema = await import('../../db/schema');
  const { default: app } = await import('../../index');
  const { generateToken } = await import('../../services/jwtService');
  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const {
    clearAiServiceTestOverrides,
    installAiServiceTestOverrides,
  } = await import('../../services/aiService');
  const {
    clearAssetStorageServiceTestOverride,
    installAssetStorageServiceTestOverride,
  } = await import('../../services/assetStorageService');
  const { setEmbeddingGeneratorForTesting } = await import('../../services/embeddingService');

  const now = new Date();
  const user = {
    id: userId,
    email: 'characters-crud@example.test',
    displayName: 'Characters CRUD',
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
    token: 'characters-crud-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;
  const childSession = {
    ...session,
    id: childSessionId,
    mode: 'child',
    childProfileId,
    scopes: ['child_mode'],
    token: 'characters-crud-child-token',
  } as any;

  function makeCharacter(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      userId,
      childProfileId: null,
      name: id === usedCharacterId ? 'Used Fox' : 'Maple Fox',
      type: 'animal',
      subtype: 'other_animal',
      referencePhotos: [],
      turnaroundSheet: null,
      aiGeneratedDescription: null,
      description: null,
      descriptionEn: null,
      descriptionLanguage: null,
      isHidden: false,
      isActive: true,
      createdByMode: 'parent',
      createdByChildProfileId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  const charactersById = new Map<string, any>([
    [characterId, makeCharacter(characterId)],
    [usedCharacterId, makeCharacter(usedCharacterId)],
    [
      childCreatedCharacterId,
      makeCharacter(childCreatedCharacterId, {
        name: 'Spark',
        createdByMode: 'child',
        createdByChildProfileId: childProfileId,
      }),
    ],
  ]);
  const hardDeletedIds: string[] = [];
  let softHidden = false;
  const turnaroundSheets: unknown[] = [];
  const savedTurnaroundCaches: Array<{ cacheId: string; size: number }> = [];
  const savedNameTranslations: Array<{ locale: string; value: string }> = [];

  const subscription = {
    planId,
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    resetAt: new Date('2099-01-01T00:00:00.000Z'),
    paymentProvider: 'stripe',
  };

  const createQuotaTx = createScriptedTransaction({
    selects: [
      { label: 'character subscription', table: schema.userSubscriptions, rows: [subscription] },
      {
        label: 'character plan limit',
        table: schema.planFeatures,
        rows: [{ value: { limit: 5 } }],
      },
      { label: 'character current usage', table: schema.usageEvents, rows: [{ total: 1 }] },
    ],
    inserts: [{ label: 'character quota reservation', table: schema.usageEvents }],
  });
  const exceededQuotaTx = createScriptedTransaction({
    selects: [
      { label: 'character subscription', table: schema.userSubscriptions, rows: [subscription] },
      {
        label: 'character plan limit',
        table: schema.planFeatures,
        rows: [{ value: { limit: 2 } }],
      },
      { label: 'character current usage', table: schema.usageEvents, rows: [{ total: 2 }] },
    ],
  });
  const quotaRunner = createTransactionRunner([createQuotaTx, exceededQuotaTx]);

  const imageProvider = new MockImageProvider().queueGenerate(
    'image_generate',
    mockGeneratedImage()
  );
  const renameTextProvider = new MockTextProvider()
    .queueText(
      'translation',
      JSON.stringify({
        uk: 'Ліхтарик',
        ru: 'Фонарик',
        en: 'Lantern',
        es: 'Linterna',
        fr: 'Lanterne',
        de: 'Laterne',
        pl: 'Latarnia',
      })
    )
    .queueText(
      'translation',
      JSON.stringify({
        uk: 'Іскринка',
        ru: 'Искорка',
        en: 'Little Spark',
        es: 'Chispita',
        fr: 'Petite Étincelle',
        de: 'Fünkchen',
        pl: 'Iskierka',
      })
    )
    .queueText(
      'translation',
      JSON.stringify({
        uk: 'Яскрава Іскринка',
        ru: 'Яркая Искорка',
        en: 'Bright Spark',
        es: 'Chispa Brillante',
        fr: 'Étincelle Vive',
        de: 'Heller Funke',
        pl: 'Jasna Iskierka',
      })
    )
    .queueText('translation', 'A friendly red fox with a scarf.')
    .queueText(
      'translation',
      JSON.stringify({
        uk: 'Лис Ліхтарик',
        ru: 'Лис Фонарик',
        en: 'Lantern Fox',
        es: 'Zorro Linterna',
        fr: 'Renard Lanterne',
        de: 'Laternenfuchs',
        pl: 'Lis Latarnia',
      })
    );
  installAiServiceTestOverrides({
    textProvider: renameTextProvider,
    llmTurnaroundImageProvider: imageProvider,
    embeddingGenerator: async () => {
      throw new Error('skip embedding for create contract');
    },
  });
  setEmbeddingGeneratorForTesting(async () => {
    throw new Error('skip embedding for create contract');
  });

  installAssetStorageServiceTestOverride({
    saveLlmTurnaroundCacheImage: async (cacheId: string, buffer: Buffer) => {
      savedTurnaroundCaches.push({ cacheId, size: buffer.length });
      const storagePath = `llm_turnaround_cache/${cacheId}.png`;
      return {
        storagePath,
        storageUrl: `/api/v1/assets/${storagePath}`,
      };
    },
    uploadUserPhoto: async () => {
      throw new Error('Unexpected uploadUserPhoto during description-only create');
    },
    generateAvatarThumbnail: async (buffer: Buffer) => buffer,
  } as any);

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (requestedSessionId: string) => ({
        session: requestedSessionId === childSessionId ? childSession : session,
        user,
      }),
      updateLastActive: async () => undefined,
      revokeById: async () => undefined,
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
    childProfile: {
      findByUserId: async () => [],
      findById: async () => null,
    } as any,
    dictionary: {
      findTranslationsForEntities: async () => [],
      upsertTranslation: async (input: { locale: string; value: string }) => {
        savedNameTranslations.push({ locale: input.locale, value: input.value });
        return input;
      },
    } as any,
    character: {
      transaction: quotaRunner.transaction,
      findByUserId: async (_ownerId: string, type?: string) =>
        [...charactersById.values()].filter((character) => {
          if (type && character.type !== type) return false;
          return true;
        }),
      findSavedCharacterIds: async () => new Set<string>(),
      findById: async (id: string, ownerId: string) => {
        const character = charactersById.get(id);
        return character && character.userId === ownerId ? character : null;
      },
      create: async (data: Record<string, unknown>) => {
        const character = makeCharacter(createdCharacterId, {
          ...data,
          id: createdCharacterId,
          name: data.name,
          type: data.type,
          subtype: data.subtype,
          description: data.description,
          createdByMode: data.createdByMode ?? 'parent',
        });
        charactersById.set(createdCharacterId, character);
        return character;
      },
      update: async (id: string, ownerId: string, data: Record<string, unknown>) => {
        const character = charactersById.get(id);
        if (!character || character.userId !== ownerId) return null;
        Object.assign(character, data, { updatedAt: new Date() });
        if (data.isHidden === true) softHidden = true;
        return character;
      },
      updateTurnaroundSheet: async (id: string, sheet: unknown) => {
        turnaroundSheets.push(sheet);
        const character = charactersById.get(id);
        if (character) {
          character.turnaroundSheet = sheet;
        }
      },
      updateDescriptionEn: async (id: string, descriptionEn: string) => {
        const character = charactersById.get(id);
        if (character) character.descriptionEn = descriptionEn;
      },
      countStoriesUsingCharacter: async (id: string) => (id === usedCharacterId ? 2 : 0),
      countStoryRequestsUsingCharacter: async () => 0,
      hardDelete: async (id: string, ownerId: string) => {
        const character = charactersById.get(id);
        if (!character || character.userId !== ownerId) return;
        charactersById.delete(id);
        hardDeletedIds.push(id);
      },
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: string, path: string, body?: unknown, auth = authorization) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization: auth,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const listOk = await request('GET', '/api/v1/characters?type=animal');
    assert.equal(listOk.status, 200, 'list characters returns 200');
    const listOkBody = (await listOk.json()) as any;
    assert.equal(listOkBody.status, 'success');
    assert.equal(listOkBody.characters.length, 3);
    assert.ok(
      listOkBody.characters.some((character: any) => character.id === childCreatedCharacterId),
      'parent character library includes characters created by child profiles'
    );

    const getOk = await request('GET', `/api/v1/characters/${characterId}`);
    assert.equal(getOk.status, 200, 'get character returns 200');
    const getOkBody = (await getOk.json()) as any;
    assert.equal(getOkBody.character.id, characterId);
    assert.equal(getOkBody.character.name, 'Maple Fox');

    const getMissing = await request('GET', `/api/v1/characters/${missingCharacterId}`);
    assert.equal(getMissing.status, 404, 'get missing character returns 404');

    const patchOk = await request('PATCH', `/api/v1/characters/${characterId}`, {
      isHidden: true,
    });
    assert.equal(patchOk.status, 200, 'patch isHidden returns 200');
    const patchOkBody = (await patchOk.json()) as any;
    assert.equal(patchOkBody.character.isHidden, true);

    const renameOk = await request('PATCH', `/api/v1/characters/${characterId}/name`, {
      name: 'Lantern',
    });
    assert.equal(renameOk.status, 200, 'rename returns 200');
    const renameOkBody = (await renameOk.json()) as any;
    assert.equal(renameOkBody.character.name, 'Lantern');
    assert.equal(renameOkBody.character.nameTranslations.ru, 'Фонарик');
    assert.equal(savedNameTranslations.length, 7, 'rename persists every supported locale');

    const childRenameParentCharacter = await request(
      'PATCH',
      `/api/v1/characters/${characterId}/name`,
      { name: 'Not Allowed' },
      childAuthorization
    );
    assert.equal(
      childRenameParentCharacter.status,
      403,
      'child cannot rename a parent-created character'
    );
    const childRenameParentCharacterBody = (await childRenameParentCharacter.json()) as any;
    assert.equal(
      childRenameParentCharacterBody.code,
      'CHILD_CHARACTER_RENAME_REQUIRES_PARENT_PROFILE'
    );

    const childRenameOwnCharacter = await request(
      'PATCH',
      `/api/v1/characters/${childCreatedCharacterId}/name`,
      { name: 'Little Spark' },
      childAuthorization
    );
    assert.equal(
      childRenameOwnCharacter.status,
      200,
      'child can rename a character created by the active child profile'
    );
    const childRenameOwnCharacterBody = (await childRenameOwnCharacter.json()) as any;
    assert.equal(childRenameOwnCharacterBody.character.name, 'Little Spark');
    assert.equal(childRenameOwnCharacterBody.character.nameTranslations.ru, 'Искорка');
    assert.equal(savedNameTranslations.length, 14, 'child rename persists every supported locale');

    const parentRenameChildCharacter = await request(
      'PATCH',
      `/api/v1/characters/${childCreatedCharacterId}/name`,
      { name: 'Bright Spark' }
    );
    assert.equal(
      parentRenameChildCharacter.status,
      200,
      'parent can rename a character created by a child profile'
    );
    const parentRenameChildCharacterBody = (await parentRenameChildCharacter.json()) as any;
    assert.equal(parentRenameChildCharacterBody.character.name, 'Bright Spark');
    assert.equal(parentRenameChildCharacterBody.character.nameTranslations.ru, 'Яркая Искорка');
    assert.equal(savedNameTranslations.length, 21);

    const parentDeleteChildCharacter = await request(
      'DELETE',
      `/api/v1/characters/${childCreatedCharacterId}`
    );
    assert.equal(
      parentDeleteChildCharacter.status,
      204,
      'parent can delete a character created by a child profile'
    );
    assert.ok(hardDeletedIds.includes(childCreatedCharacterId));

    const renameInvalid = await request('PATCH', `/api/v1/characters/${characterId}/name`, {
      name: '   ',
    });
    assert.equal(renameInvalid.status, 400, 'blank rename returns 400');

    const deleteUnused = await request('DELETE', `/api/v1/characters/${characterId}`);
    assert.equal(deleteUnused.status, 204, 'unused delete returns 204');
    assert.ok(hardDeletedIds.includes(characterId));
    assert.equal(charactersById.has(characterId), false);

    const deleteUsed = await request('DELETE', `/api/v1/characters/${usedCharacterId}`);
    assert.equal(deleteUsed.status, 200, 'used delete soft-hides with 200');
    const deleteUsedBody = (await deleteUsed.json()) as any;
    assert.equal(deleteUsedBody.isHidden, true);
    assert.equal(softHidden, true);
    assert.equal(charactersById.get(usedCharacterId)?.isHidden, true);

    const createInvalid = await request('POST', '/api/v1/characters', {
      name: 'No Description Fox',
      type: 'animal',
      subtype: 'other_animal',
    });
    assert.equal(createInvalid.status, 400, 'create without description/photos returns 400');

    const createOk = await request('POST', '/api/v1/characters', {
      name: 'Lantern Fox',
      type: 'animal',
      subtype: 'other_animal',
      description: 'A friendly red fox with a scarf.',
    });
    assert.equal(createOk.status, 201, 'create character returns 201');
    const createOkBody = (await createOk.json()) as any;
    assert.equal(createOkBody.status, 'success');
    assert.equal(createOkBody.character.id, createdCharacterId);
    assert.equal(createOkBody.character.name, 'Lantern Fox');
    assert.ok(createOkBody.character.turnaroundSheet?.url);
    assert.equal(turnaroundSheets.length, 1);
    assert.equal(savedTurnaroundCaches.length >= 1, true);
    assert.equal(createQuotaTx.inserts.length, 1);
    renameTextProvider.assertExhausted();
    assert.equal(
      (createQuotaTx.inserts[0].values as { eventType: string }).eventType,
      'character_generated'
    );
    imageProvider.assertExhausted();

    const createQuotaExceeded = await request('POST', '/api/v1/characters', {
      name: 'Quota Fox',
      type: 'animal',
      subtype: 'other_animal',
      description: 'Should be blocked by monthly character quota.',
    });
    assert.equal(createQuotaExceeded.status, 429, 'quota exceeded returns 429');
    const createQuotaExceededBody = (await createQuotaExceeded.json()) as any;
    assert.equal(createQuotaExceededBody.code, 'CHARACTER_LIMIT_EXCEEDED');
    quotaRunner.assertExhausted();
  } finally {
    setEmbeddingGeneratorForTesting(null);
    clearAiServiceTestOverrides();
    clearAssetStorageServiceTestOverride();
    clearRepositoryTestOverrides();
    await close(server);
  }

  console.log('characters CRUD HTTP contract passed (15 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
