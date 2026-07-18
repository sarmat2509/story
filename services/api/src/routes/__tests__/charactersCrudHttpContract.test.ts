import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import {
  createScriptedTransaction,
  createTransactionRunner,
} from '../../testing/scriptedTransaction';
import { MockImageProvider, mockGeneratedImage } from '../../testing/ai';

const userId = 'd1111111-1111-4111-8111-111111111111';
const sessionId = 'd2222222-2222-4222-8222-222222222222';
const characterId = 'd3333333-3333-4333-8333-333333333331';
const usedCharacterId = 'd3333333-3333-4333-8333-333333333332';
const createdCharacterId = 'd3333333-3333-4333-8333-333333333333';
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
  ]);
  let hardDeleted = false;
  let softHidden = false;
  const turnaroundSheets: unknown[] = [];
  const savedTurnaroundCaches: Array<{ cacheId: string; size: number }> = [];

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
  installAiServiceTestOverrides({
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
      findValidByIdWithUser: async () => ({ session, user }),
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
    } as any,
    character: {
      transaction: quotaRunner.transaction,
      findByUserId: async (_ownerId: string, type?: string) =>
        [...charactersById.values()].filter((character) => {
          if (type && character.type !== type) return false;
          return true;
        }),
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
      countStoriesUsingCharacter: async (id: string) => (id === usedCharacterId ? 2 : 0),
      countStoryRequestsUsingCharacter: async () => 0,
      hardDelete: async (id: string, ownerId: string) => {
        const character = charactersById.get(id);
        if (!character || character.userId !== ownerId) return;
        charactersById.delete(id);
        hardDeleted = true;
      },
    } as any,
  });

  const authorization = `Bearer ${generateToken({ userId, sessionId })}`;
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  const request = (method: string, path: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    const listOk = await request('GET', '/api/v1/characters?type=animal');
    assert.equal(listOk.status, 200, 'list characters returns 200');
    const listOkBody = (await listOk.json()) as any;
    assert.equal(listOkBody.status, 'success');
    assert.equal(listOkBody.characters.length, 2);

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

    const deleteUnused = await request('DELETE', `/api/v1/characters/${characterId}`);
    assert.equal(deleteUnused.status, 204, 'unused delete returns 204');
    assert.equal(hardDeleted, true);
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

  console.log('characters CRUD HTTP contract passed (9 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
