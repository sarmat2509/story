import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';

const userId = '91111111-1111-4111-8111-111111111111';
const parentSessionId = '92222222-2222-4222-8222-222222222221';
const childSessionId = '92222222-2222-4222-8222-222222222222';
const childProfileId = '93333333-3333-4333-8333-333333333333';

const mapTileStoryId1 = '94444444-4444-4444-8444-444444444441';
const mapTileStoryId2 = '94444444-4444-4444-8444-444444444442';

const artifactStoryId = '94444444-4444-4444-8444-444444444443';
const artifactNoClosingStoryId = '94444444-4444-4444-8444-444444444444';
const artifactMissingLookupStoryId = '94444444-4444-4444-8444-444444444445';
const artifactChildReadableStoryId = '94444444-4444-4444-8444-444444444446';

const artifactId = '95555555-5555-4555-8555-555555555551';
const missingArtifactLookupId = '95555555-5555-4555-8555-555555555552';

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
  const { MockImageProvider } = await import('../../testing/ai/MockImageProvider');
  const { mockGeneratedImage } = await import('../../testing/ai/fixtures');

  const now = new Date();
  const user = {
    id: userId,
    email: 'maptile-artifact-contract@example.test',
    displayName: 'Map Tile Contract',
    role: 'user',
    status: 'active',
    preferredLocale: 'en',
    mode: 'artisan',
    onboardingCompleted: true,
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

  function makeStory(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      userId,
      childProfileId: null,
      createdByChildProfileId: null,
      title: 'The Hidden Grove',
      language: 'en',
      ageGroup: '6-8',
      metadata: {},
      coverAssetId: null,
      closingArtifactId: null,
      closingKeepsakeLabel: null,
      createdAt: now,
      ...overrides,
    } as any;
  }

  const storiesById = new Map<string, any>([
    [mapTileStoryId1, makeStory(mapTileStoryId1)],
    [mapTileStoryId2, makeStory(mapTileStoryId2)],
    [
      artifactStoryId,
      makeStory(artifactStoryId, {
        closingArtifactId: artifactId,
        closingKeepsakeLabel: 'A Silver Key',
      }),
    ],
    [artifactNoClosingStoryId, makeStory(artifactNoClosingStoryId)],
    [
      artifactMissingLookupStoryId,
      makeStory(artifactMissingLookupStoryId, { closingArtifactId: missingArtifactLookupId }),
    ],
    [
      artifactChildReadableStoryId,
      makeStory(artifactChildReadableStoryId, {
        childProfileId,
        closingArtifactId: artifactId,
      }),
    ],
  ]);

  const artifactsById = new Map<string, any>([
    [
      artifactId,
      {
        id: artifactId,
        artifactCode: 'silver_key',
        title: 'Silver Key',
        description: 'A small silver key that hums with warmth.',
        imagePath: 'artifacts/silver-key.png',
        semanticTags: ['key', 'silver'],
      },
    ],
  ]);

  const storyUpdates: Array<{ storyId: string; patch: unknown }> = [];
  let assetIdCounter = 0;
  const assetsById = new Map<string, any>();
  let uploadCounter = 0;

  function createMapTileAsset(storyId: string, generationParams: Record<string, unknown>) {
    assetIdCounter += 1;
    const asset = {
      id: `96666666-6666-4666-8666-6666666666${String(assetIdCounter).padStart(2, '0')}`,
      storyId,
      assetType: 'image',
      status: 'completed',
      mimeType: 'image/png',
      storagePath: `map-tiles/mock-${assetIdCounter}.png`,
      storageUrl: null,
      generationParams,
      createdAt: new Date(now.getTime() + assetIdCounter),
    };
    assetsById.set(asset.id, asset);
    return asset;
  }

  type CollectedTileRow = {
    collection: any;
    asset: any;
    story: { id: string; title: string; language: string; coverAssetId: string | null; createdAt: Date };
  };
  const collectedTiles: CollectedTileRow[] = [];

  function ownerMatches(owner: { userId: string; childProfileId?: string | null }, row: any): boolean {
    return (
      row.userId === owner.userId && (row.childProfileId ?? null) === (owner.childProfileId ?? null)
    );
  }

  type CollectedArtifactRow = {
    collection: any;
    artifact: any;
    story: { id: string; title: string; language: string; createdAt: Date };
  };
  const collectedArtifacts: CollectedArtifactRow[] = [];

  installRepositoryTestOverrides({
    session: {
      findValidByIdWithUser: async (sessionId: string) => ({
        session: sessionId === childSessionId ? childSession : parentSession,
        user,
      }),
      updateLastActive: async () => undefined,
    } as any,
    user: { findById: async () => user } as any,
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
      updateStory: async (id: string, patch: unknown) => {
        storyUpdates.push({ storyId: id, patch });
        const story = storiesById.get(id);
        if (story) {
          Object.assign(story, patch);
        }
        return undefined;
      },
    } as any,
    dictionary: {
      findTranslations: async () => [],
      findTranslationsForEntities: async () => [],
    } as any,
    asset: {
      create: async (input: any) => {
        assetIdCounter += 1;
        const asset = {
          id: `97777777-7777-4777-8777-7777777777${String(assetIdCounter).padStart(2, '0')}`,
          ...input,
          createdAt: new Date(now.getTime() + assetIdCounter),
        };
        assetsById.set(asset.id, asset);
        return asset;
      },
      findById: async (id: string) => assetsById.get(id) ?? null,
      findLatestCompletedMapTileByStoryId: async (storyId: string) => {
        const candidates = Array.from(assetsById.values())
          .filter(
            (asset) =>
              asset.storyId === storyId &&
              asset.status === 'completed' &&
              asset.generationParams?.kind === 'map_tile'
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return candidates[0] ?? null;
      },
      findCompletedSceneImagesByStoryId: async () => [],
      findByIds: async (ids: string[]) => ids.map((id) => assetsById.get(id)).filter(Boolean),
      findCompletedImagesByStoryIds: async () => [],
    } as any,
    scene: {
      findByStoryIds: async () => [],
    } as any,
    childProfile: {
      findById: async () => null,
    } as any,
    collectedMapTile: {
      replaceStoryAssetReference: async (params: {
        storyId: string;
        assetId: string;
        maskId: string;
        connectors: Record<string, string>;
      }) => {
        let updated = 0;
        for (const row of collectedTiles) {
          if (row.collection.storyId === params.storyId) {
            row.collection.assetId = params.assetId;
            row.collection.maskId = params.maskId;
            row.collection.connectors = params.connectors;
            row.asset = assetsById.get(params.assetId) ?? row.asset;
            updated += 1;
          }
        }
        return updated;
      },
      listForOwner: async (owner: any) =>
        collectedTiles.filter((row) => ownerMatches(owner, row.collection)),
      findForOwnerStory: async (owner: any, storyId: string) =>
        collectedTiles.find(
          (row) => ownerMatches(owner, row.collection) && row.collection.storyId === storyId
        ) ?? null,
      nextInventoryOrder: async (owner: any) => {
        const orders = collectedTiles
          .filter((row) => ownerMatches(owner, row.collection) && row.collection.location === 'inventory')
          .map((row) => row.collection.inventoryOrder ?? 0);
        return orders.length === 0 ? 0 : Math.max(...orders) + 1;
      },
      create: async (data: any) => {
        const story = storiesById.get(data.storyId);
        const asset = assetsById.get(data.assetId);
        const row: CollectedTileRow = {
          collection: { id: randomUUID(), acquiredAt: now, ...data },
          asset,
          story: {
            id: story.id,
            title: story.title,
            language: story.language,
            coverAssetId: story.coverAssetId,
            createdAt: story.createdAt,
          },
        };
        collectedTiles.push(row);
        return row;
      },
      updatePlacementsForOwner: async (owner: any, placements: any[]) => {
        for (const placement of placements) {
          const row = collectedTiles.find(
            (candidate) => ownerMatches(owner, candidate.collection) && candidate.collection.id === placement.id
          );
          if (!row) continue;
          row.collection.location = placement.location;
          row.collection.boardX = placement.location === 'board' ? placement.boardX ?? 0 : null;
          row.collection.boardY = placement.location === 'board' ? placement.boardY ?? 0 : null;
          row.collection.inventoryOrder =
            placement.location === 'inventory' ? placement.inventoryOrder ?? 0 : 0;
        }
        return collectedTiles.filter((row) => ownerMatches(owner, row.collection));
      },
    } as any,
    storyArtifact: {
      findById: async (id: string) => artifactsById.get(id) ?? null,
    } as any,
    collectedStoryArtifact: {
      findForOwnerStoryArtifact: async (params: {
        userId: string;
        childProfileId?: string | null;
        artifactId: string;
        storyId: string;
      }) =>
        collectedArtifacts.find(
          (row) =>
            row.collection.userId === params.userId &&
            (row.collection.childProfileId ?? null) === (params.childProfileId ?? null) &&
            row.collection.artifactId === params.artifactId &&
            row.collection.storyId === params.storyId
        ) ?? null,
      create: async (data: any) => {
        const story = storiesById.get(data.storyId);
        const artifact = artifactsById.get(data.artifactId);
        const row: CollectedArtifactRow = {
          collection: { id: randomUUID(), acquiredAt: now, ...data },
          artifact,
          story: { id: story.id, title: story.title, language: story.language, createdAt: story.createdAt },
        };
        collectedArtifacts.push(row);
        return row;
      },
    } as any,
  });

  const mapTileImageProvider = new MockImageProvider()
    .queueGenerate('image_map_tile', mockGeneratedImage())
    .queueGenerate('image_map_tile', mockGeneratedImage());
  installAiServiceTestOverrides({ mapTileImageProvider });
  installAssetStorageServiceTestOverride({
    uploadAsset: async (input: { data: Buffer }) => {
      uploadCounter += 1;
      return {
        storagePath: `map-tiles/upload-${uploadCounter}.png`,
        storageUrl: null,
        signedUrl: null,
        signedUrlExpiresAt: null,
        fileSizeBytes: Buffer.isBuffer(input.data) ? input.data.length : 0,
      };
    },
    generateThumbnail: async () => {
      throw new Error('map tile generation should not request thumbnails');
    },
  } as any);

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const parentAuthorization = `Bearer ${generateToken({ userId, sessionId: parentSessionId })}`;
  const childAuthorization = `Bearer ${generateToken({ userId, sessionId: childSessionId })}`;

  const post = (path: string, body: unknown, authorization: string) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const put = (path: string, body: unknown, authorization: string) =>
    fetch(`${origin}${path}`, {
      method: 'PUT',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const get = (path: string, authorization: string) =>
    fetch(`${origin}${path}`, { headers: { authorization } });

  try {
    // 1. Map tile non-dry-run generation persists an asset and updates story metadata.
    const generateTile1 = await post(
      `/api/v1/stories/${mapTileStoryId1}/map-tile`,
      {
        mapTile: { description: 'A quiet forest clearing with a stone bridge', requiredFeatures: [] },
        maskId: 'path-we',
        useStoryImageReferences: false,
        dryRun: false,
      },
      parentAuthorization
    );
    assert.equal(generateTile1.status, 200, 'non-dry-run map tile generation succeeds');
    const generateTile1Body = (await generateTile1.json()) as any;
    assert.equal(generateTile1Body.mapTile.dryRun, false);
    assert.equal(generateTile1Body.mapTile.mask.id, 'path-we');
    assert.equal(storyUpdates.length, 1, 'story metadata is updated with the persisted tile asset');
    assert.equal(storyUpdates[0].storyId, mapTileStoryId1);
    const assetId1 = (storyUpdates[0].patch as any).metadata.mapTileAssetId;
    assert.ok(assetId1, 'generated asset id is persisted on the story');

    const generateTile2 = await post(
      `/api/v1/stories/${mapTileStoryId2}/map-tile`,
      {
        mapTile: { description: 'A sunlit meadow path', requiredFeatures: [] },
        maskId: 'path-we',
        useStoryImageReferences: false,
        dryRun: false,
      },
      parentAuthorization
    );
    assert.equal(generateTile2.status, 200, 'second story tile generation succeeds');
    const assetId2 = (storyUpdates[1].patch as any).metadata.mapTileAssetId;

    // 2. Story map tile status reflects the generated asset with nothing collected yet.
    const status1 = await get(`/api/v1/me/map-tiles/story/${mapTileStoryId1}`, parentAuthorization);
    assert.equal(status1.status, 200);
    const status1Body = (await status1.json()) as any;
    assert.equal(status1Body.generated.id, assetId1);
    assert.equal(status1Body.collected, null);

    // 3. Collecting the tile for the first time returns 201.
    const collect1First = await post(
      '/api/v1/me/map-tiles/collect',
      { storyId: mapTileStoryId1 },
      parentAuthorization
    );
    assert.equal(collect1First.status, 201, 'first map tile collection returns 201');
    const collect1FirstBody = (await collect1First.json()) as any;
    assert.equal(collect1FirstBody.alreadyCollected, false);
    const collectedTileId1 = collect1FirstBody.tile.id;

    // Re-collecting the same story tile is idempotent and returns 200.
    const collect1Again = await post(
      '/api/v1/me/map-tiles/collect',
      { storyId: mapTileStoryId1 },
      parentAuthorization
    );
    assert.equal(collect1Again.status, 200, 'repeat collection returns 200');
    assert.equal((await collect1Again.json() as any).alreadyCollected, true);

    const collect2First = await post(
      '/api/v1/me/map-tiles/collect',
      { storyId: mapTileStoryId2 },
      parentAuthorization
    );
    assert.equal(collect2First.status, 201);
    const collectedTileId2 = (await collect2First.json() as any).tile.id;

    // 4. Listing collected tiles returns both entries.
    const listTiles = await get('/api/v1/me/map-tiles', parentAuthorization);
    assert.equal(listTiles.status, 200);
    const listTilesBody = (await listTiles.json()) as any;
    assert.equal(listTilesBody.tiles.length, 2, 'both collected tiles are listed');

    // 5. Layout: valid placement succeeds.
    const layoutOk = await put(
      '/api/v1/me/map-tiles/layout',
      { placements: [{ id: collectedTileId1, location: 'board', boardX: 1, boardY: 1 }] },
      parentAuthorization
    );
    assert.equal(layoutOk.status, 200, 'valid layout placement succeeds');
    const layoutOkBody = (await layoutOk.json()) as any;
    const placedTile = layoutOkBody.tiles.find((tile: any) => tile.id === collectedTileId1);
    assert.equal(placedTile.location, 'board');
    assert.equal(placedTile.boardX, 1);

    // Layout: unknown tile id in the owner's collection returns 404.
    const layoutMissing = await put(
      '/api/v1/me/map-tiles/layout',
      { placements: [{ id: '99999999-9999-4999-8999-999999999999', location: 'inventory' }] },
      parentAuthorization
    );
    assert.equal(layoutMissing.status, 404, 'placing an unowned tile returns 404');

    // Layout: two tiles claiming the same board cell in one request collide.
    const layoutCollision = await put(
      '/api/v1/me/map-tiles/layout',
      {
        placements: [
          { id: collectedTileId1, location: 'board', boardX: 2, boardY: 2 },
          { id: collectedTileId2, location: 'board', boardX: 2, boardY: 2 },
        ],
      },
      parentAuthorization
    );
    assert.equal(layoutCollision.status, 409, 'colliding board placements return 409');

    // 6. Artifact collection: first collect returns 201.
    const collectArtifactFirst = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: artifactStoryId },
      parentAuthorization
    );
    assert.equal(collectArtifactFirst.status, 201, 'first artifact collection returns 201');
    const collectArtifactFirstBody = (await collectArtifactFirst.json()) as any;
    assert.equal(collectArtifactFirstBody.alreadyCollected, false);
    assert.equal(collectArtifactFirstBody.artifact.acquiredLabel, 'A Silver Key');

    // Re-collecting the same artifact is idempotent and returns 200.
    const collectArtifactAgain = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: artifactStoryId },
      parentAuthorization
    );
    assert.equal(collectArtifactAgain.status, 200, 'repeat artifact collection returns 200');
    assert.equal((await collectArtifactAgain.json() as any).alreadyCollected, true);

    // Invalid payload (storyId is not a UUID) returns 400.
    const collectArtifactInvalid = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: 'not-a-uuid' },
      parentAuthorization
    );
    assert.equal(collectArtifactInvalid.status, 400, 'invalid artifact payload returns 400');

    // Story without a closing artifact returns 400.
    const collectArtifactNoClosing = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: artifactNoClosingStoryId },
      parentAuthorization
    );
    assert.equal(collectArtifactNoClosing.status, 400, 'story with no collectible artifact returns 400');

    // Requested artifactId that does not match the story's artifact returns 409.
    const collectArtifactMismatch = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: artifactStoryId, artifactId: missingArtifactLookupId },
      parentAuthorization
    );
    assert.equal(collectArtifactMismatch.status, 409, 'mismatched artifactId returns 409');

    // Story references an artifact id that cannot be resolved returns 404.
    const collectArtifactUnresolvable = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: artifactMissingLookupStoryId },
      parentAuthorization
    );
    assert.equal(
      collectArtifactUnresolvable.status,
      404,
      'unresolvable story artifact reference returns 404'
    );

    // Unknown story returns 404.
    const collectArtifactUnknownStory = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: '88888888-8888-4888-8888-888888888888' },
      parentAuthorization
    );
    assert.equal(collectArtifactUnknownStory.status, 404, 'unknown story returns 404');

    // Child-owner scope: a child session collects into its own isolated collection.
    const collectArtifactChild = await post(
      '/api/v1/me/artifacts/collect',
      { storyId: artifactChildReadableStoryId },
      childAuthorization
    );
    assert.equal(collectArtifactChild.status, 201, 'child session collects into its own scope');
    const collectArtifactChildBody = (await collectArtifactChild.json()) as any;
    assert.equal(collectArtifactChildBody.artifact.childProfileId, childProfileId);
  } finally {
    clearRepositoryTestOverrides();
    clearAiServiceTestOverrides();
    clearAssetStorageServiceTestOverride();
    await close(server);
  }

  console.log('map tile / artifact HTTP contract passed (18 input-output cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
