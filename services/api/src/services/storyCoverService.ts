import type { Asset, Story } from '../db/schema';
import {
  getAssetRepository,
  getSceneRepository,
  getStoryRepository,
} from '../repositories';

export type StoryCoverAsset = {
  assetId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  storagePath: string;
  thumbnailPath: string | null;
};

type StoryCoverRef = Pick<Story, 'id' | 'coverAssetId'>;

function isUsableImageAsset(asset: Asset | null | undefined): asset is Asset {
  return !!asset && asset.assetType === 'image' && asset.status === 'completed' && !!asset.storagePath;
}

function publicAssetPath(storagePath: string | null | undefined): string | null {
  return storagePath ? `/api/v1/assets/${storagePath}` : null;
}

function mapAssetToCover(asset: Asset): StoryCoverAsset {
  return {
    assetId: asset.id,
    imageUrl: publicAssetPath(asset.storagePath)!,
    thumbnailUrl: publicAssetPath(asset.thumbnailPath),
    storagePath: asset.storagePath,
    thumbnailPath: asset.thumbnailPath,
  };
}

async function findCanonicalSceneImageAssetId(storyId: string): Promise<string | null> {
  const scenes = await getSceneRepository().findByStoryId(storyId);
  if (scenes.length === 0) return null;

  const candidateScenes = scenes.filter((scene) => !!scene.imageUrl);

  if (candidateScenes.length === 0) return null;

  const imageAssets = await getAssetRepository().findCompletedImagesByStoryIds([storyId]);
  const matchingAsset = candidateScenes
    .map((scene) =>
      imageAssets.find(
        (asset) =>
          asset.storagePath === scene.imageUrl &&
          asset.sceneNumber === scene.sceneId
      )
    )
    .find(Boolean);

  return matchingAsset?.id ?? null;
}

export async function resolveStoryCoverAssetId(storyId: string): Promise<string | null> {
  return findCanonicalSceneImageAssetId(storyId);
}

export async function validateStoryCoverAssetId(
  storyId: string,
  coverAssetId: string
): Promise<string | null> {
  const asset = await getAssetRepository().findById(coverAssetId);
  if (!isUsableImageAsset(asset) || asset.storyId !== storyId || !asset.sceneId) {
    return null;
  }

  const scene = await getSceneRepository().findByStoryId(storyId);
  const assetScene = scene.find((item) => item.id === asset.sceneId);
  if (!assetScene || assetScene.imageUrl !== asset.storagePath) {
    return null;
  }

  return asset.id;
}

export async function ensureStoryDefaultCoverAssetId(storyId: string): Promise<string | null> {
  const story = await getStoryRepository().findById(storyId);
  if (!story) return null;
  if (story.coverAssetId) return story.coverAssetId;

  const coverAssetId = await resolveStoryCoverAssetId(storyId);
  if (!coverAssetId) return null;

  await getStoryRepository().updateStory(storyId, { coverAssetId });
  return coverAssetId;
}

export async function setStoryCoverAssetIfMissing(
  storyId: string,
  assetId: string
): Promise<void> {
  const story = await getStoryRepository().findById(storyId);
  if (!story || story.coverAssetId) return;
  await getStoryRepository().updateStory(storyId, { coverAssetId: assetId });
}

export async function refreshStoryCoverAssetForScene(
  storyId: string,
  sceneDbId: string,
  assetId: string
): Promise<void> {
  const story = await getStoryRepository().findById(storyId);
  if (!story) return;

  if (!story.coverAssetId) {
    await ensureStoryDefaultCoverAssetId(storyId);
    return;
  }

  const currentCoverAsset = await getAssetRepository().findById(story.coverAssetId);
  if (!currentCoverAsset) {
    const coverAssetId = await resolveStoryCoverAssetId(storyId);
    if (coverAssetId) {
      await getStoryRepository().updateStory(storyId, { coverAssetId });
    }
    return;
  }

  if (currentCoverAsset?.sceneId !== sceneDbId) return;

  await getStoryRepository().updateStory(storyId, { coverAssetId: assetId });
}

export async function loadStoryCoverAssets(
  stories: StoryCoverRef[]
): Promise<Map<string, StoryCoverAsset>> {
  const result = new Map<string, StoryCoverAsset>();
  const uniqueStories = Array.from(
    new Map(stories.map((story) => [story.id, story])).values()
  );
  if (uniqueStories.length === 0) return result;

  const coverAssetIds = Array.from(
    new Set(uniqueStories.map((story) => story.coverAssetId).filter(Boolean) as string[])
  );
  const coverAssets = await getAssetRepository().findByIds(coverAssetIds);
  const assetById = new Map(coverAssets.map((asset) => [asset.id, asset]));

  const fallbackStoryIds: string[] = [];
  for (const story of uniqueStories) {
    const asset = story.coverAssetId ? assetById.get(story.coverAssetId) : null;
    if (isUsableImageAsset(asset) && asset.storyId === story.id) {
      result.set(story.id, mapAssetToCover(asset));
    } else {
      fallbackStoryIds.push(story.id);
    }
  }

  if (fallbackStoryIds.length === 0) return result;

  const [scenes, imageAssets] = await Promise.all([
    getSceneRepository().findByStoryIds(fallbackStoryIds),
    getAssetRepository().findCompletedImagesByStoryIds(fallbackStoryIds),
  ]);

  const firstImagePathByStoryId = new Map<string, { sceneId: number; imageUrl: string }>();
  for (const scene of scenes) {
    if (!scene.imageUrl || firstImagePathByStoryId.has(scene.storyId)) continue;
    firstImagePathByStoryId.set(scene.storyId, {
      sceneId: scene.sceneId,
      imageUrl: scene.imageUrl,
    });
  }

  const assetByStoryPath = new Map<string, (typeof imageAssets)[number]>();
  for (const asset of imageAssets) {
    assetByStoryPath.set(`${asset.storyId}:${asset.sceneNumber}:${asset.storagePath}`, asset);
  }

  for (const storyId of fallbackStoryIds) {
    const sceneImage = firstImagePathByStoryId.get(storyId);
    if (!sceneImage) continue;
    const asset = assetByStoryPath.get(
      `${storyId}:${sceneImage.sceneId}:${sceneImage.imageUrl}`
    );
    if (!asset) continue;
    result.set(storyId, {
      assetId: asset.id,
      imageUrl: publicAssetPath(asset.storagePath)!,
      thumbnailUrl: publicAssetPath(asset.thumbnailPath),
      storagePath: asset.storagePath,
      thumbnailPath: asset.thumbnailPath,
    });
  }

  return result;
}
