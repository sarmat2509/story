import { getStoryDirectorSceneRepository } from '../repositories';
import { getIllustrationBlockStartSceneIds } from './storyOrchestration/utilities';

type DirectorSceneLike = {
  sceneId: number;
  environmentId?: string | null;
  characterOutfitIds?: Record<string, string> | null;
  sceneVisual?: unknown;
};

export async function persistStoryDirectorScenes(
  storyId: string,
  scenes: DirectorSceneLike[],
  imagesPerStory: number
): Promise<void> {
  const totalScenes = scenes.length;
  if (totalScenes === 0) {
    await getStoryDirectorSceneRepository().replaceForStory(storyId, []);
    return;
  }

  const blockSize = Math.max(1, Math.ceil(totalScenes / Math.max(1, imagesPerStory)));
  const anchorSceneIds = new Set(getIllustrationBlockStartSceneIds(totalScenes, imagesPerStory));

  await getStoryDirectorSceneRepository().replaceForStory(
    storyId,
    scenes.map((scene) => {
      const zeroBasedSceneOffset = Math.max(0, scene.sceneId - 1);
      const illustrationBlockIndex = imagesPerStory > 0
        ? Math.min(Math.floor(zeroBasedSceneOffset / blockSize), Math.max(0, imagesPerStory - 1))
        : 0;
      const isBlockAnchor = anchorSceneIds.has(scene.sceneId);

      return {
        sceneIndex: scene.sceneId,
        environmentId: scene.environmentId ?? null,
        characterOutfitIds: scene.characterOutfitIds ?? null,
        sceneVisual: isBlockAnchor ? (scene.sceneVisual ?? null) : null,
        illustrationBlockIndex,
        isBlockAnchor,
      };
    }),
  );
}
