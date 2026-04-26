/**
 * Removes all persisted audio for a story (DB + best-effort storage),
 * so TTS can run from scratch with no chunk reuse.
 */

import { getAlignmentRepository, getAssetRepository, getStoryRepository } from '../repositories';
import { getAssetStorageService } from './assetStorageService';
import { logger } from '../utils/logger';

export type ClearStoryAudioResult = {
  storyId: string;
  userId: string;
  audioAssetRowsRemoved: boolean;
  audioFileAssetsRemoved: boolean;
  alignmentRemoved: boolean;
  storageFilesAttempted: number;
  storageFilesDeleted: number;
};

export async function clearStoryAudioData(storyId: string): Promise<ClearStoryAudioResult> {
  const story = await getStoryRepository().findById(storyId);
  if (!story) {
    throw new Error('Story not found');
  }

  const audioAssetsRepo = getAssetRepository();
  const fileRows = await audioAssetsRepo.findByStoryId(storyId, 'audio');
  const storage = getAssetStorageService();

  let storageFilesAttempted = 0;
  let storageFilesDeleted = 0;

  for (const row of fileRows) {
    for (const path of [row.storagePath, row.thumbnailPath].filter(Boolean) as string[]) {
      storageFilesAttempted += 1;
      try {
        await storage.deleteAsset(path);
        storageFilesDeleted += 1;
      } catch (err) {
        logger.warn({ err, storyId, path }, 'Failed to delete audio file from storage (continuing DB cleanup)');
      }
    }
  }

  await getAlignmentRepository().deleteByStoryId(storyId);

  const audioMetaRows = await audioAssetsRepo.findAudioAssetsByStoryId(storyId);
  if (audioMetaRows.length > 0) {
    await audioAssetsRepo.deleteAudioAssetsByStoryId(storyId);
  }

  await audioAssetsRepo.deleteStoryAudioFileAssets(storyId);

  await getStoryRepository().updateStory(storyId, {
    audioMetadata: null,
    updatedAt: new Date(),
  });

  if (story.isPublished && story.publishedSlug) {
    await getStoryRepository().incrementPublicRenderVersion(storyId);
  }

  logger.info(
    {
      storyId,
      storageFilesAttempted,
      storageFilesDeleted,
      hadAudioMetaRows: audioMetaRows.length > 0,
    },
    'Story audio cleared (DB + storage)',
  );

  return {
    storyId,
    userId: story.userId,
    audioAssetRowsRemoved: audioMetaRows.length > 0,
    audioFileAssetsRemoved: fileRows.length > 0,
    alignmentRemoved: true,
    storageFilesAttempted,
    storageFilesDeleted,
  };
}
