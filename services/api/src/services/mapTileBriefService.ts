import type { StorySpec } from '../ai/types';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { getStoryDomainService } from './aiService';
import { composeScenesIntoBlocks } from './storyOrchestration/utilities';

export type MapTileBriefScene = {
  sceneId: number;
  text: string;
};

export type MapTileBriefCharacter = {
  id?: string;
  characterRef?: string;
  name: string;
  canonicalName?: string;
  nameAliases?: string[];
};

export function resolveMapTileBriefImageCount(params: {
  sceneCount: number;
  imagesOverride?: number;
  metadata?: Record<string, unknown>;
}): number {
  const metadata = params.metadata ?? {};
  const sceneImageCount = Array.isArray(metadata.sceneIdsWithImages)
    ? metadata.sceneIdsWithImages.length
    : undefined;
  const candidates = [
    params.imagesOverride,
    metadata.mixedStoryComicBlockCount,
    metadata.graphicNovelPlannedPageCount,
    metadata.graphicNovelPageCount,
    sceneImageCount,
  ];
  const configured = candidates.find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  );
  const fallback = Math.min(3, Math.max(1, params.sceneCount));
  return Math.max(1, Math.min(params.sceneCount, Math.floor(configured ?? fallback)));
}

export function buildMapTileBriefInputForScenes(params: {
  scenes: MapTileBriefScene[];
  imagesPerStory: number;
  spec: StorySpec;
  userCharacters: MapTileBriefCharacter[];
}) {
  const scenes = params.scenes
    .filter((scene) => typeof scene.text === 'string' && scene.text.trim().length > 0)
    .map((scene, index) => ({
      sceneId: index + 1,
      text: scene.text,
    }));

  if (scenes.length === 0) {
    throw new Error('Cannot generate map tile brief without story scenes');
  }

  const requestedImages = Number.isFinite(params.imagesPerStory)
    ? Math.floor(params.imagesPerStory)
    : 1;
  const imagesPerStory = Math.max(1, Math.min(scenes.length, requestedImages));

  return {
    blocks: composeScenesIntoBlocks(scenes, imagesPerStory),
    imagesPerStory,
    spec: params.spec,
    userCharacters: params.userCharacters.filter((character) => character.name?.trim()),
  };
}

export async function generateMapTileBriefForScenes(params: {
  scenes: MapTileBriefScene[];
  imagesPerStory: number;
  spec: StorySpec;
  userCharacters: MapTileBriefCharacter[];
  onUsage?: (usage: UsageMetadata) => void;
}): Promise<{ description: string; requiredFeatures: string[] }> {
  const input = buildMapTileBriefInputForScenes(params);
  return getStoryDomainService().generateMapTileBrief(input, {
    onUsage: params.onUsage,
  });
}
