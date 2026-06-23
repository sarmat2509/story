/**
 * Me Map Tiles API
 * GET /api/v1/me/map-tiles - List collected map tiles for current parent/child profile
 * GET /api/v1/me/map-tiles/story/:storyId - Read generated/collected map tile status for a story
 * POST /api/v1/me/map-tiles/collect - Collect a generated story map tile
 * PUT /api/v1/me/map-tiles/layout - Persist board/inventory layout
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authMiddleware';
import {
  getAssetRepository,
  getChildProfileRepository,
  getCollectedMapTileRepository,
  getStoryRepository,
} from '../repositories';
import type {
  CollectedMapTileDetails,
  MapTileCollectionOwner,
} from '../repositories/CollectedMapTileRepository';
import type { Asset } from '../db/schema';
import { MAP_TILE_MASK_VARIANTS } from '../domain/story/mapTileMasks';
import { canReadStoryForSession } from '../services/childStoryAccessService';
import { loadStoryCoverAssets } from '../services/storyCoverService';
import { stripCharacterIds } from '../utils/audioTags';
import { logger } from '../utils/logger';

const router = Router();

type StoryCoverImage = {
  assetId?: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
};

const listQuerySchema = z.object({
  childProfileId: z.string().uuid().optional(),
});

const collectBodySchema = z.object({
  storyId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  childProfileId: z.string().uuid().optional(),
});

const layoutBodySchema = z.object({
  placements: z
    .array(
      z.object({
        id: z.string().uuid(),
        location: z.enum(['board', 'inventory']),
        boardX: z.number().int().min(-1000).max(1000).nullable().optional(),
        boardY: z.number().int().min(-1000).max(1000).nullable().optional(),
        inventoryOrder: z.number().int().min(0).max(10000).nullable().optional(),
      })
    )
    .max(500),
});

function publicAssetUrl(asset: Pick<Asset, 'storagePath' | 'storageUrl'>): string {
  return asset.storageUrl || `/api/v1/assets/${asset.storagePath}`;
}

function isMapTileAsset(asset: Asset): boolean {
  return (
    asset.assetType === 'image' &&
    asset.status === 'completed' &&
    isMapTileGenerationParams(asset.generationParams)
  );
}

function isMapTileGenerationParams(params: unknown): boolean {
  return (
    !!params &&
    typeof params === 'object' &&
    (params as Record<string, unknown>).kind === 'map_tile'
  );
}

function readMapTileAssetGeometry(asset: Asset): {
  maskId: string;
  connectors: Record<string, string>;
  features: string[];
  layers: unknown[];
  routeGroups: unknown[];
} {
  const params = asset.generationParams as Record<string, unknown> | null;
  const maskId = typeof params?.maskId === 'string' ? params.maskId : 'path-we';
  const mask = MAP_TILE_MASK_VARIANTS.find((item) => item.id === maskId);
  return {
    maskId,
    connectors: { ...(mask?.connectors ?? {}) },
    features: [...(mask?.features ?? [])],
    layers: [...(mask?.layers ?? [])],
    routeGroups: [...(mask?.routeGroups ?? [])],
  };
}

function readMapTileMaskGeometry(maskId: string): {
  features: string[];
  layers: unknown[];
  routeGroups: unknown[];
} {
  const mask = MAP_TILE_MASK_VARIANTS.find((item) => item.id === maskId);
  return {
    features: [...(mask?.features ?? [])],
    layers: [...(mask?.layers ?? [])],
    routeGroups: [...(mask?.routeGroups ?? [])],
  };
}

async function resolveCollectionOwner(
  req: Request,
  requestedChildProfileId?: string
): Promise<{ owner: MapTileCollectionOwner } | { status: number; message: string }> {
  const userId = req.user!.id;

  if (req.sessionMode === 'child') {
    if (!req.childProfileId) {
      return { status: 403, message: 'Child profile context is required' };
    }
    return { owner: { userId, childProfileId: req.childProfileId } };
  }

  if (!requestedChildProfileId) {
    return { owner: { userId, childProfileId: null } };
  }

  const childProfile = await getChildProfileRepository().findById(requestedChildProfileId, userId);
  if (!childProfile) {
    return { status: 404, message: 'Child profile not found' };
  }

  return { owner: { userId, childProfileId: requestedChildProfileId } };
}

function mapGeneratedAsset(asset: Asset | null) {
  if (!asset) return null;
  const geometry = readMapTileAssetGeometry(asset);
  return {
    id: asset.id,
    storyId: asset.storyId,
    imageUrl: publicAssetUrl(asset),
    storagePath: asset.storagePath,
    mimeType: asset.mimeType,
    maskId: geometry.maskId,
    connectors: geometry.connectors,
    features: geometry.features,
    layers: geometry.layers,
    routeGroups: geometry.routeGroups,
    createdAt: asset.createdAt,
  };
}

function mapCollectedTile(details: CollectedMapTileDetails, storyCover?: StoryCoverImage | null) {
  const { collection, asset, story } = details;
  const geometry = readMapTileMaskGeometry(collection.maskId);
  return {
    id: collection.id,
    userId: collection.userId,
    childProfileId: collection.childProfileId,
    storyId: collection.storyId,
    assetId: collection.assetId,
    acquiredLabel: collection.acquiredLabel,
    acquiredAt: collection.acquiredAt,
    imageUrl: publicAssetUrl(asset),
    storagePath: asset.storagePath,
    mimeType: asset.mimeType,
    maskId: collection.maskId,
    connectors: collection.connectors ?? {},
    features: geometry.features,
    layers: geometry.layers,
    routeGroups: geometry.routeGroups,
    location: collection.location,
    boardX: collection.boardX,
    boardY: collection.boardY,
    inventoryOrder: collection.inventoryOrder,
    story: {
      id: story.id,
      title: stripCharacterIds(story.title),
      language: story.language,
      createdAt: story.createdAt,
      coverAssetId: storyCover?.assetId ?? story.coverAssetId ?? null,
      coverImageUrl: storyCover?.imageUrl ?? null,
      coverThumbnailUrl: storyCover?.thumbnailUrl ?? null,
    },
  };
}

async function mapCollectedTilesWithCovers(details: CollectedMapTileDetails[]) {
  const coverByStoryId = await loadStoryCoverAssets(
    details.map((item) => ({
      id: item.story.id,
      coverAssetId: item.story.coverAssetId,
    }))
  );
  return details.map((item) => mapCollectedTile(item, coverByStoryId.get(item.story.id)));
}

async function mapCollectedTileWithCover(details: CollectedMapTileDetails) {
  const coverByStoryId = await loadStoryCoverAssets([
    { id: details.story.id, coverAssetId: details.story.coverAssetId },
  ]);
  return mapCollectedTile(details, coverByStoryId.get(details.story.id));
}

async function syncCollectedMapTileReference(storyId: string, asset: Asset | null): Promise<void> {
  if (!asset || !isMapTileAsset(asset)) return;

  const geometry = readMapTileAssetGeometry(asset);
  const updated = await getCollectedMapTileRepository().replaceStoryAssetReference({
    storyId,
    assetId: asset.id,
    maskId: geometry.maskId,
    connectors: geometry.connectors,
  });

  if (updated > 0) {
    logger.info(
      {
        storyId,
        assetId: asset.id,
        updatedCollectedTiles: updated,
      },
      'Collected map tiles synced to current generated story tile'
    );
  }
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid map tile collection query',
        errors: parsed.error.flatten(),
      });
    }

    const ownerResult = await resolveCollectionOwner(req, parsed.data.childProfileId);
    if ('status' in ownerResult) {
      return res.status(ownerResult.status).json({
        status: 'error',
        message: ownerResult.message,
      });
    }

    const rows = await getCollectedMapTileRepository().listForOwner(ownerResult.owner);
    return res.json({
      status: 'success',
      tiles: await mapCollectedTilesWithCovers(rows),
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List collected map tiles failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list map tiles',
    });
  }
});

router.get('/story/:storyId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storyId = z.string().uuid().parse(req.params.storyId);
    const story = await getStoryRepository().findByIdAndUser(storyId, req.user!.id);

    if (!story || !canReadStoryForSession(req, story)) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const ownerResult = await resolveCollectionOwner(
      req,
      typeof req.query.childProfileId === 'string' ? req.query.childProfileId : undefined
    );
    if ('status' in ownerResult) {
      return res.status(ownerResult.status).json({
        status: 'error',
        message: ownerResult.message,
      });
    }

    const [generated, initialCollected] = await Promise.all([
      getAssetRepository().findLatestCompletedMapTileByStoryId(storyId),
      getCollectedMapTileRepository().findForOwnerStory(ownerResult.owner, storyId),
    ]);
    if (generated && initialCollected && initialCollected.collection.assetId !== generated.id) {
      await syncCollectedMapTileReference(storyId, generated);
    }
    const collected =
      generated && initialCollected && initialCollected.collection.assetId !== generated.id
        ? await getCollectedMapTileRepository().findForOwnerStory(ownerResult.owner, storyId)
        : initialCollected;

    const coverByStoryId = await loadStoryCoverAssets([
      { id: storyId, coverAssetId: story.coverAssetId },
    ]);

    return res.json({
      status: 'success',
      generated: mapGeneratedAsset(generated),
      collected: collected ? mapCollectedTile(collected, coverByStoryId.get(storyId)) : null,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Get story map tile status failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get story map tile status',
    });
  }
});

router.post('/collect', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = collectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid map tile collect payload',
        errors: parsed.error.flatten(),
      });
    }

    const { storyId, assetId, childProfileId } = parsed.data;
    const story = await getStoryRepository().findByIdAndUser(storyId, req.user!.id);
    if (!story || !canReadStoryForSession(req, story)) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const ownerResult = await resolveCollectionOwner(req, childProfileId);
    if ('status' in ownerResult) {
      return res.status(ownerResult.status).json({
        status: 'error',
        message: ownerResult.message,
      });
    }

    const repo = getCollectedMapTileRepository();
    const [latestAsset, explicitAsset] = await Promise.all([
      getAssetRepository().findLatestCompletedMapTileByStoryId(storyId),
      assetId ? getAssetRepository().findById(assetId) : Promise.resolve(null),
    ]);
    const requestedAsset = latestAsset ?? explicitAsset;
    const existing = await repo.findForOwnerStory(ownerResult.owner, storyId);
    if (existing) {
      if (requestedAsset && requestedAsset.storyId === storyId && isMapTileAsset(requestedAsset)) {
        await syncCollectedMapTileReference(storyId, requestedAsset);
      }
      const syncedExisting = await repo.findForOwnerStory(ownerResult.owner, storyId);
      return res.json({
        status: 'success',
        tile: await mapCollectedTileWithCover(syncedExisting ?? existing),
        alreadyCollected: true,
      });
    }

    const asset = requestedAsset;

    if (!asset || asset.storyId !== storyId || !isMapTileAsset(asset)) {
      return res.status(404).json({
        status: 'error',
        message: 'Generated map tile asset not found',
      });
    }

    const geometry = readMapTileAssetGeometry(asset);
    const created = await repo.create({
      userId: ownerResult.owner.userId,
      childProfileId: ownerResult.owner.childProfileId ?? null,
      storyId,
      assetId: asset.id,
      acquiredLabel: stripCharacterIds(story.title),
      maskId: geometry.maskId,
      connectors: geometry.connectors,
      location: 'inventory',
      boardX: null,
      boardY: null,
      inventoryOrder: await repo.nextInventoryOrder(ownerResult.owner),
    });

    return res.status(201).json({
      status: 'success',
      tile: await mapCollectedTileWithCover(created),
      alreadyCollected: false,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Collect story map tile failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to collect map tile',
    });
  }
});

router.put('/layout', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = layoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid map tile layout payload',
        errors: parsed.error.flatten(),
      });
    }

    const ownerResult = await resolveCollectionOwner(
      req,
      typeof req.body.childProfileId === 'string' ? req.body.childProfileId : undefined
    );
    if ('status' in ownerResult) {
      return res.status(ownerResult.status).json({
        status: 'error',
        message: ownerResult.message,
      });
    }

    const repo = getCollectedMapTileRepository();
    const current = await repo.listForOwner(ownerResult.owner);
    const currentById = new Map(current.map((item) => [item.collection.id, item]));
    const placements = parsed.data.placements.map((placement) => ({
      id: placement.id,
      location: placement.location,
      boardX: placement.boardX ?? null,
      boardY: placement.boardY ?? null,
      inventoryOrder: placement.inventoryOrder ?? null,
    }));
    const missing = placements.filter((placement) => !currentById.has(placement.id));
    if (missing.length > 0) {
      return res.status(404).json({
        status: 'error',
        message: 'One or more map tiles were not found',
      });
    }

    const finalById = new Map(
      current.map((item) => [
        item.collection.id,
        {
          id: item.collection.id,
          location: item.collection.location as 'board' | 'inventory',
          boardX: item.collection.boardX,
          boardY: item.collection.boardY,
          inventoryOrder: item.collection.inventoryOrder,
        },
      ])
    );

    for (const placement of placements) {
      finalById.set(placement.id, {
        id: placement.id,
        location: placement.location,
        boardX: placement.location === 'board' ? placement.boardX ?? 0 : null,
        boardY: placement.location === 'board' ? placement.boardY ?? 0 : null,
        inventoryOrder: placement.location === 'inventory' ? placement.inventoryOrder ?? 0 : 0,
      });
    }

    const boardCells = new Set<string>();
    for (const placement of finalById.values()) {
      if (placement.location !== 'board') continue;
      const key = `${placement.boardX}:${placement.boardY}`;
      if (boardCells.has(key)) {
        return res.status(409).json({
          status: 'error',
          message: 'Board cell is already occupied',
        });
      }
      boardCells.add(key);
    }

    const updated = await repo.updatePlacementsForOwner(ownerResult.owner, placements);
    return res.json({
      status: 'success',
      tiles: await mapCollectedTilesWithCovers(updated),
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Update map tile layout failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update map tile layout',
    });
  }
});

export default router;
