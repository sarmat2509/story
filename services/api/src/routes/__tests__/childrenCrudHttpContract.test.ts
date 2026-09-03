import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

const userId = 'c1111111-1111-4111-8111-111111111111';
const sessionId = 'c2222222-2222-4222-8222-222222222222';
const childId = 'c3333333-3333-4333-8333-333333333333';
const missingChildId = 'c9999999-9999-4999-8999-999999999999';

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
  const { MockTextProvider } = await import('../../testing/ai/MockTextProvider');

  const now = new Date();
  const user = {
    id: userId,
    email: 'children-crud@example.test',
    displayName: 'Children CRUD',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    childModeExitPasscodeHash: null,
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
    token: 'children-crud-token',
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  } as any;

  const profilesById = new Map<string, any>();
  let childDataConsentOnFile = false;
  let hardDeleted = false;

  function makeProfile(overrides: Record<string, unknown> = {}) {
    return {
      id: childId,
      userId,
      name: 'Mira',
      birthDate: '2018-05-15',
      languages: ['en'],
      referencePhotos: [],
      appearanceTraits: null,
      personality: null,
      interests: null,
      sensitivities: null,
      clothing: null,
      distinctiveFeatures: null,
      turnaroundSheet: null,
      aiGeneratedDescription: null,
      descriptionEn: null,
      descriptionLanguage: null,
      isActive: true,
      childModeEnabled: false,
      childModeSettings: null,
      childModePasscodeHash: null,
      childModePasscodeSetAt: null,
      authorPseudonym: null,
      authorAboutMe: null,
      storyCreationMode: null,
      storyTextSizeMultiplier: null,
      storyComplexityAdjustments: {},
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  installAiServiceTestOverrides({
    textProvider: new MockTextProvider(),
    validationTextProvider: new MockTextProvider(),
  });

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async () => ({ session, user }),
      updateLastActive: async () => undefined,
      revokeById: async () => undefined,
      countActiveChildSessionsByProfileIds: async () => new Map(),
      deleteByChildProfileId: async () => 0,
    } as any,
    user: {
      findById: async () => user,
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
      findSubscriptionByUserId: async () => null,
      findFeatureValue: async () => null,
    } as any,
    userConsent: {
      hasVersion: async () => childDataConsentOnFile,
      record: async () => {
        childDataConsentOnFile = true;
      },
    } as any,
    childProfile: {
      findByUserId: async () => [...profilesById.values()].filter((p) => p.isActive),
      findById: async (id: string, ownerId: string) => {
        const profile = profilesById.get(id);
        return profile && profile.userId === ownerId ? profile : null;
      },
      update: async (id: string, ownerId: string, data: Record<string, unknown>) => {
        const profile = profilesById.get(id);
        if (!profile || profile.userId !== ownerId) return null;
        Object.assign(profile, data, { updatedAt: new Date() });
        return profile;
      },
      countStoryUsage: async () => 0,
      hardDelete: async (id: string, ownerId: string) => {
        const profile = profilesById.get(id);
        if (!profile || profile.userId !== ownerId) return;
        profilesById.delete(id);
        hardDeleted = true;
      },
    } as any,
    character: {
      findByChildProfileId: async () => null,
      create: async (data: any) => ({
        id: 'c4444444-4444-4444-8444-444444444444',
        ...data,
        createdAt: now,
        updatedAt: now,
      }),
      countStoriesUsingCharacter: async () => 0,
      countStoryRequestsUsingCharacter: async () => 0,
      hardDelete: async () => undefined,
      softDelete: async () => undefined,
    } as any,
    story: {
      transaction: async (callback: (tx: any) => Promise<any>) => {
        const selectRowsQueue: unknown[][] = [[], [{ count: 0 }]];
        let insertValues: unknown = null;

        const awaitable = <T>(value: T) => ({
          then(onFulfilled?: any, onRejected?: any) {
            return Promise.resolve(value).then(onFulfilled, onRejected);
          },
        });

        const tx = {
          execute: async () => undefined,
          select: () => {
            const rows = selectRowsQueue.shift() ?? [];
            const chain: any = {
              from() {
                return chain;
              },
              innerJoin() {
                return chain;
              },
              where() {
                return chain;
              },
              limit() {
                return Promise.resolve(rows);
              },
              then: awaitable(rows).then,
            };
            return chain;
          },
          insert: () => ({
            values(values: unknown) {
              insertValues = values;
              return {
                returning: async () => [
                  makeProfile({
                    id: childId,
                    name: 'Mira',
                    birthDate: '2018-05-15',
                    languages: ['en'],
                  }),
                ],
              };
            },
          }),
        };

        const result = await callback(tx);
        const created = makeProfile({
          ...(insertValues as object),
          id: childId,
          turnaroundSheet: { url: '/api/v1/assets/test-child-turnaround.png' },
        });
        profilesById.set(childId, created);
        return result;
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
    const listEmpty = await request('GET', '/api/v1/children');
    assert.equal(listEmpty.status, 200, 'list children returns 200');
    const listEmptyBody = (await listEmpty.json()) as any;
    assert.equal(listEmptyBody.status, 'success');
    assert.equal(listEmptyBody.children.length, 0);

    const createInvalid = await request('POST', '/api/v1/children', {
      name: '',
      birthDate: '2018-05-15',
      languages: ['en'],
      storyComplexityAdjustments: { en: -2 },
      childDataConsentAccepted: true,
    });
    assert.equal(createInvalid.status, 400, 'invalid create returns 400');

    const createOk = await request('POST', '/api/v1/children', {
      name: 'Mira',
      birthDate: '2018-05-15',
      languages: ['en'],
      aiGeneratedDescription: 'Long brown hair, green eyes, and freckles.',
      storyComplexityAdjustments: { en: -2 },
      childDataConsentAccepted: true,
    });
    const createOkBody = (await createOk.json()) as any;
    assert.equal(createOk.status, 201, 'create child returns 201');
    assert.equal(createOkBody.status, 'success');
    assert.equal(createOkBody.child.id, childId);
    assert.equal(createOkBody.child.name, 'Mira');
    assert.deepEqual(createOkBody.child.storyComplexityAdjustments, { en: -2 });
    assert.ok(profilesById.has(childId));

    const listOne = await request('GET', '/api/v1/children');
    assert.equal(listOne.status, 200, 'list with child returns 200');
    const listOneBody = (await listOne.json()) as any;
    assert.equal(listOneBody.children.length, 1);
    assert.equal(listOneBody.children[0].id, childId);
    assert.equal(typeof listOneBody.children[0].age.years, 'number');

    const patchOk = await request('PATCH', `/api/v1/children/${childId}`, {
      name: 'Mira Updated',
      storyComplexityAdjustments: { en: 2 },
    });
    assert.equal(patchOk.status, 200, 'patch child returns 200');
    const patchOkBody = (await patchOk.json()) as any;
    assert.equal(patchOkBody.child.name, 'Mira Updated');
    assert.deepEqual(patchOkBody.child.storyComplexityAdjustments, { en: 2 });

    const patchInvalidComplexity = await request('PATCH', `/api/v1/children/${childId}`, {
      storyComplexityAdjustments: { en: 3 },
    });
    assert.equal(patchInvalidComplexity.status, 400, 'out-of-range complexity returns 400');

    const patchMissing = await request('PATCH', `/api/v1/children/${missingChildId}`, {
      name: 'Ghost',
    });
    assert.equal(patchMissing.status, 404, 'patch missing child returns 404');

    const deleteOk = await request('DELETE', `/api/v1/children/${childId}`);
    assert.equal(deleteOk.status, 204, 'delete child returns 204');
    assert.equal(hardDeleted, true);
    assert.equal(profilesById.has(childId), false);

    const deleteMissing = await request('DELETE', `/api/v1/children/${missingChildId}`);
    assert.equal(deleteMissing.status, 404, 'delete missing child returns 404');
  } finally {
    clearRepositoryTestOverrides();
    clearAiServiceTestOverrides();
    await close(server);
  }

  console.log('children CRUD HTTP contract passed (9 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
