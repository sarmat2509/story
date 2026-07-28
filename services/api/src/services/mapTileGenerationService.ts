import fs from 'node:fs/promises';
import path from 'node:path';
import { getAssetRepository } from '../repositories';
import type { MapTileMaskVariant } from '../domain/story/mapTileMasks';
import {
  canonicalizeMapTileFeatures,
  MAP_TILE_MASK_VARIANTS,
  selectMapTileMask,
} from '../domain/story/mapTileMasks';
import { buildMapTilePromptParts, optionalNoVisibleTextRule } from '../prompts/image';
import { getMapTileImageDomainService } from './aiService';
import { getAssetStorageService } from './assetStorageService';
import { recordUsage, USAGE_OP_IMAGE_MAP_TILE } from './aiUsageService';
import { logger } from '../utils/logger';

export interface MapTileBriefInput {
  description?: string;
  requiredFeatures?: string[];
}

export interface GenerateMapTileInput {
  userId: string;
  storyId: string;
  sceneDbId?: string | null;
  sceneIndex?: number | null;
  storyContext?: string;
  mapTile: MapTileBriefInput;
  useStoryImageReferences?: boolean;
  referenceAssetIds?: string[];
  maxStoryImageReferences?: number;
  randomizeDirections?: boolean;
  maskId?: string;
  dryRun?: boolean;
  includePrompt?: boolean;
}

export interface GenerateMapTileResult {
  dryRun: boolean;
  mask: Pick<
    MapTileMaskVariant,
    'id' | 'label' | 'description' | 'connectors' | 'topology' | 'routeGroups' | 'features'
  >;
  prompt?: string;
  systemInstruction?: string;
  mapTile: MapTileBriefInput;
  referenceAssets: Array<{
    id: string;
    sceneIndex: number | null;
    storagePath: string;
    mimeType: string;
    source: 'story_scene_image' | 'explicit_asset_id';
  }>;
  asset?: {
    id: string;
    imageUrl: string;
    storagePath: string;
    mimeType: string;
    width: number;
    height: number;
  };
}

const DEFAULT_STORY_IMAGE_REFERENCE_LIMIT = 3;
const MAX_STORY_IMAGE_REFERENCE_LIMIT = 3;
const WATERFALL_FEATURE_PATTERN = /\b(waterfall|falling water|water curtain|cascade)\b/i;

type ResolvedMapTileReferenceAsset = {
  id: string;
  sceneIndex: number | null;
  storagePath: string;
  mimeType: string;
  source: 'story_scene_image' | 'explicit_asset_id';
  buffer?: Buffer;
};

function findMaskById(maskId: string): MapTileMaskVariant {
  const mask = MAP_TILE_MASK_VARIANTS.find((item) => item.id === maskId);
  if (!mask) {
    throw new Error(`Unknown map tile mask id: ${maskId}`);
  }
  return mask;
}

async function readMaskPng(maskId: string): Promise<{ buffer: Buffer; path: string }> {
  const relative = path.join('assets', 'map-tile-mask-library', `${maskId}.png`);
  const candidates = [
    path.resolve(process.cwd(), relative),
    path.resolve(process.cwd(), 'services', 'api', relative),
    path.resolve(__dirname, '..', '..', relative),
    path.resolve(process.cwd(), 'output', 'map-tile-mask-library', `${maskId}.png`),
    path.resolve(process.cwd(), 'services', 'api', 'output', 'map-tile-mask-library', `${maskId}.png`),
  ];

  for (const candidate of candidates) {
    try {
      return {
        buffer: await fs.readFile(candidate),
        path: candidate,
      };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(
    `Map tile mask PNG not found for ${maskId}. Run: cd services/api && pnpm exec tsx src/scripts/generateMapTileMasks.ts`
  );
}

function publicAssetUrl(storagePath: string, storageUrl: string | null): string {
  return storageUrl || `/api/v1/assets/${storagePath}`;
}

function clampReferenceLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_STORY_IMAGE_REFERENCE_LIMIT;
  }
  return Math.max(0, Math.min(MAX_STORY_IMAGE_REFERENCE_LIMIT, Math.floor(value)));
}

function uniqueStrings(values: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeAssetPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutQuery = value.split('?')[0] ?? value;
  const withoutApiPrefix = withoutQuery.replace(/^\/api\/v1\/assets\//, '');
  return withoutApiPrefix.replace(/^\/+/, '');
}

async function resolveMapTileReferenceAssets(params: {
  storyId: string;
  referenceAssetIds?: string[];
  useStoryImageReferences?: boolean;
  maxStoryImageReferences?: number;
  includeBuffers: boolean;
}): Promise<ResolvedMapTileReferenceAsset[]> {
  const assetRepo = getAssetRepository();
  const rows = await assetRepo.findCompletedSceneImagesByStoryId(params.storyId);
  const limit = clampReferenceLimit(params.maxStoryImageReferences);
  const explicitIds = uniqueStrings(params.referenceAssetIds);

  let selected: ResolvedMapTileReferenceAsset[] = [];

  if (explicitIds.length > 0) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const missing = explicitIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Map tile reference image asset(s) not found for this story or not completed scene images: ${missing.join(', ')}`
      );
    }

    selected = explicitIds.slice(0, MAX_STORY_IMAGE_REFERENCE_LIMIT).map((id) => {
      const row = byId.get(id)!;
      return {
        id: row.id,
        sceneIndex: row.sceneNumber ?? null,
        storagePath: row.storagePath,
        mimeType: row.mimeType,
        source: 'explicit_asset_id' as const,
      };
    });
  } else if (params.useStoryImageReferences !== false && limit > 0) {
    const latestByScene = new Map<number | string, typeof rows[number]>();
    const displayedByScene = new Map<number | string, typeof rows[number]>();
    for (const row of rows) {
      const key = row.sceneNumber ?? row.sceneId ?? row.id;
      if (!latestByScene.has(key)) {
        latestByScene.set(key, row);
      }
      const displayedPath = normalizeAssetPath(row.sceneImageUrl);
      if (
        displayedPath &&
        displayedPath === normalizeAssetPath(row.storagePath) &&
        !displayedByScene.has(key)
      ) {
        displayedByScene.set(key, row);
      }
    }

    const selectedRows = Array.from(latestByScene.entries()).map(
      ([key, latest]) => displayedByScene.get(key) ?? latest
    );

    selected = selectedRows
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        sceneIndex: row.sceneNumber ?? null,
        storagePath: row.storagePath,
        mimeType: row.mimeType,
        source: 'story_scene_image' as const,
      }));
  }

  if (!params.includeBuffers || selected.length === 0) {
    return selected;
  }

  const assetStorage = getAssetStorageService();
  return Promise.all(
    selected.map(async (ref) => ({
      ...ref,
      buffer: await assetStorage.getAssetByPath(ref.storagePath),
    }))
  );
}

function storyReferenceInstruction(ref: ResolvedMapTileReferenceAsset, index: number): string {
  const imageNumber = index + 2;
  const sceneText = ref.sceneIndex ? ` for story scene ${ref.sceneIndex}` : '';
  return [
    `Image ${imageNumber} is a story illustration reference${sceneText}.`,
    'Use it for landmark appearance, materials, colors, texture language, and story-specific visual consistency.',
    'Do not copy its camera angle, horizon, sky, framing, foreground/background depth, character staging, or scene composition.',
    'Flatten any referenced landmark into a top-down board-game map symbol or surface texture that follows Image 1.',
    optionalNoVisibleTextRule()
      ? 'Convert readable writing, book titles, screen text, symbols, and labels into abstract decorative marks.'
      : '',
    'Image 1 remains the geometry map and the only source for layout, route positions, and camera perspective.',
  ].filter(Boolean).join(' ');
}

export async function generateMapTile(
  input: GenerateMapTileInput
): Promise<GenerateMapTileResult> {
  const startTime = Date.now();
  const inferredFeatures = WATERFALL_FEATURE_PATTERN.test(input.mapTile.description ?? '')
    ? ['waterfall']
    : [];
  const tileBrief = {
    description: input.mapTile.description,
    requiredFeatures: canonicalizeMapTileFeatures([
      ...(input.mapTile.requiredFeatures ?? []),
      ...inferredFeatures,
    ]),
  };

  if (!tileBrief.description?.trim()) {
    throw new Error('mapTile.description is required');
  }

  const selectedMask = input.maskId
    ? findMaskById(input.maskId)
    : selectMapTileMask({
        requiredFeatures: tileBrief.requiredFeatures,
        description: tileBrief.description,
        randomizeDirections: input.randomizeDirections,
      });
  const maskImage = await readMaskPng(selectedMask.id);
  const referenceAssets = await resolveMapTileReferenceAssets({
    storyId: input.storyId,
    referenceAssetIds: input.referenceAssetIds,
    useStoryImageReferences: input.useStoryImageReferences,
    maxStoryImageReferences: input.maxStoryImageReferences,
    includeBuffers: !input.dryRun,
  });
  const { prompt, systemInstruction } = buildMapTilePromptParts({
    tileBrief,
    storyContext: input.storyContext,
    maskId: selectedMask.id,
    maskTopology: selectedMask.topology,
    maskConnectors: selectedMask.connectors,
    maskRouteGroups: selectedMask.routeGroups,
  });

  const maskPayload = {
    id: selectedMask.id,
    label: selectedMask.label,
    description: selectedMask.description,
    connectors: selectedMask.connectors,
    topology: selectedMask.topology,
    routeGroups: selectedMask.routeGroups,
    features: selectedMask.features,
  };

  if (input.dryRun) {
    return {
      dryRun: true,
      mask: maskPayload,
      prompt,
      systemInstruction,
      mapTile: tileBrief,
      referenceAssets: referenceAssets.map(({ buffer: _buffer, ...ref }) => ref),
    };
  }

  const imageDomain = getMapTileImageDomainService();
  const image = await imageDomain.generateMapTile(
    {
      prompt,
      systemInstruction,
      maskImage: {
        buffer: maskImage.buffer,
        mimeType: 'image/png',
        instructionText:
          'Image 1 is the geometry map in final square canvas coordinates. Use its road, water, bridge, connector-mouth, edge-position, width, curve, junction, and route-connection geometry. Treat waterfall symbols as local drop markers between higher and lower water segments. Portal markers give entrance area and route contact point only; do not copy their drawn arch, door shape, color, or front-facing perspective. Style materials and scenery from the story.',
      },
      storyReferenceImages: referenceAssets
        .filter((ref): ref is ResolvedMapTileReferenceAsset & { buffer: Buffer } => !!ref.buffer)
        .map((ref, index) => ({
          buffer: ref.buffer,
          mimeType: ref.mimeType,
          instructionText: storyReferenceInstruction(ref, index),
        })),
    },
    {
      onUsage: (usage) =>
        recordUsage(
          {
            ...usage,
            operation: USAGE_OP_IMAGE_MAP_TILE,
          },
          {
            userId: input.userId,
            storyId: input.storyId,
          }
        ),
    }
  );

  const assetStorage = getAssetStorageService();
  const uploadResult = await assetStorage.uploadAsset({
    data: image.imageData,
    mimeType: image.mimeType,
    userId: input.userId,
    storyId: input.storyId,
    assetType: 'image',
  });

  const asset = await getAssetRepository().create({
    storyId: input.storyId,
    sceneId: input.sceneDbId ?? null,
    assetType: 'image',
    storagePath: uploadResult.storagePath,
    storageUrl: uploadResult.storageUrl,
    signedUrl: uploadResult.signedUrl,
    signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
    mimeType: image.mimeType,
    fileSizeBytes: uploadResult.fileSizeBytes,
    generationParams: {
      kind: 'map_tile',
      scope: input.sceneIndex ? 'scene' : 'story',
      ...(input.sceneIndex ? { sceneIndex: input.sceneIndex } : {}),
      maskId: selectedMask.id,
      maskPath: maskImage.path,
      maskRouteGroups: selectedMask.routeGroups,
      mapTile: tileBrief,
      storyContext: input.storyContext ?? null,
      referenceAssets: referenceAssets.map(({ buffer: _buffer, ...ref }) => ref),
      prompt,
      systemInstruction,
    },
    generationTimeMs: Date.now() - startTime,
    status: 'completed',
  });

  logger.info(
    {
      storyId: input.storyId,
      sceneIndex: input.sceneIndex,
      assetId: asset.id,
      maskId: selectedMask.id,
      referenceAssetCount: referenceAssets.length,
      durationMs: Date.now() - startTime,
    },
    'Map tile generated'
  );

  return {
    dryRun: false,
    mask: maskPayload,
    prompt: input.includePrompt ? prompt : undefined,
    mapTile: tileBrief,
    referenceAssets: referenceAssets.map(({ buffer: _buffer, ...ref }) => ref),
    asset: {
      id: asset.id,
      imageUrl: publicAssetUrl(uploadResult.storagePath, uploadResult.storageUrl),
      storagePath: uploadResult.storagePath,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
    },
  };
}
