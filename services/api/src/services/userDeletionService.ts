import {
  getCharacterRepository,
  getChildProfileRepository,
  getStoryRepository,
  getUserRepository,
} from '../repositories';
import { incrementLandingRenderVersion, removePublishedSlug } from '../ssr/storyCache';
import { collectEntityAssetPaths } from './entityAssetCleanupService';
import { collectStoryStoragePathsForDeletion, deleteStoragePaths } from './storyDeletionService';
import { invalidateSitemapCache } from './sitemapService';
import { logger } from '../utils/logger';

export interface DeleteUserDataResult {
  userId: string;
  storyCount: number;
  childProfileCount: number;
  characterCount: number;
  storageFilesAttempted: number;
  storageFilesDeleted: number;
  publishedStoryCount: number;
}

function addPaths(paths: Set<string>, values: string[]): void {
  for (const value of values) {
    paths.add(value);
  }
}

export async function deleteUserData(userId: string): Promise<DeleteUserDataResult> {
  const user = await getUserRepository().findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const [stories, childProfiles, characters] = await Promise.all([
    getStoryRepository().findAllByUserId(userId),
    getChildProfileRepository().findAllByUserId(userId),
    getCharacterRepository().findAllByUserId(userId),
  ]);

  const storagePaths = new Set<string>();
  for (const story of stories) {
    addPaths(storagePaths, await collectStoryStoragePathsForDeletion(story.id));
  }

  for (const childProfile of childProfiles) {
    addPaths(storagePaths, collectEntityAssetPaths({
      referencePhotos: childProfile.referencePhotos,
      turnaroundSheet: childProfile.turnaroundSheet,
    }));
  }

  for (const character of characters) {
    addPaths(storagePaths, collectEntityAssetPaths({
      referencePhotos: character.referencePhotos,
      turnaroundSheet: character.turnaroundSheet,
    }));
  }

  addPaths(storagePaths, collectEntityAssetPaths({
    referencePhotos: user.avatarUrl ? [{ url: user.avatarUrl }] : [],
  }));

  const storageDeletion = await deleteStoragePaths([...storagePaths]);

  await getUserRepository().delete(userId);

  const publishedStories = stories.filter((story) => !!story.publishedSlug);
  for (const story of publishedStories) {
    await removePublishedSlug(story.publishedSlug!);
  }
  if (publishedStories.length > 0) {
    await invalidateSitemapCache();
  }

  if (stories.some((story) => story.showOnHomePage === true)) {
    await incrementLandingRenderVersion();
  }

  const result = {
    userId,
    storyCount: stories.length,
    childProfileCount: childProfiles.length,
    characterCount: characters.length,
    storageFilesAttempted: storageDeletion.attempted,
    storageFilesDeleted: storageDeletion.deleted,
    publishedStoryCount: publishedStories.length,
  };

  logger.info(result, 'User account deleted with storage cleanup');
  return result;
}
