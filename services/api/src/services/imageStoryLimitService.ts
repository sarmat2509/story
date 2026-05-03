import { config } from '../config';
import { getSceneRepository, getStoryRepository } from '../repositories';
import type { Story } from '../db/schema';
import { getPlanFeatures } from './planService';
import {
  getIllustrationBlockStartSceneIds,
  getIllustrationSceneIds,
} from './storyOrchestration/utilities';

export type ImageStoryLimitCode =
  | 'IMAGE_GENERATION_NOT_AVAILABLE'
  | 'IMAGES_PER_STORY_LIMIT_EXCEEDED';

export type ImageStoryLimitDecision =
  | { allowed: true; allowedSceneIds: number[] }
  | {
      allowed: false;
      statusCode: 403 | 429;
      code: ImageStoryLimitCode;
      message: string;
      featureSlug: 'images_per_story';
      limit: number;
      used: number;
      allowedSceneIds: number[];
    };

export class ImageStoryLimitError extends Error {
  readonly statusCode: 403 | 429;
  readonly code: ImageStoryLimitCode;
  readonly featureSlug = 'images_per_story';
  readonly limit: number;
  readonly used: number;
  readonly allowedSceneIds: number[];

  constructor(decision: Exclude<ImageStoryLimitDecision, { allowed: true }>) {
    super(decision.message);
    this.name = 'ImageStoryLimitError';
    this.statusCode = decision.statusCode;
    this.code = decision.code;
    this.limit = decision.limit;
    this.used = decision.used;
    this.allowedSceneIds = decision.allowedSceneIds;
  }
}

export function isImageStoryLimitError(error: unknown): error is ImageStoryLimitError {
  return error instanceof ImageStoryLimitError;
}

export function getAllowedIllustrationSceneIds(input: {
  totalScenes: number;
  imagesPerStory: number;
  useDirectorFlow?: boolean;
}): number[] {
  const imagesPerStory = Math.max(0, Math.floor(input.imagesPerStory || 0));
  const totalScenes = Math.max(0, Math.floor(input.totalScenes || 0));
  if (imagesPerStory <= 0 || totalScenes <= 0) {
    return [];
  }
  const targetImages = Math.min(imagesPerStory, totalScenes);

  const ids = input.useDirectorFlow
    ? getIllustrationBlockStartSceneIds(totalScenes, targetImages)
    : getIllustrationSceneIds(totalScenes, targetImages);
  return Array.from(new Set(ids));
}

export function evaluateSceneImageGenerationAccess(input: {
  sceneId: number;
  totalScenes: number;
  imagesPerStory: number;
  existingImageSceneIds: Iterable<number>;
  useDirectorFlow?: boolean;
}): ImageStoryLimitDecision {
  const limit = Math.max(0, Math.floor(input.imagesPerStory || 0));
  const existingImageSceneIds = new Set(input.existingImageSceneIds);
  const used = existingImageSceneIds.size;
  const allowedSceneIds = getAllowedIllustrationSceneIds({
    totalScenes: input.totalScenes,
    imagesPerStory: limit,
    useDirectorFlow: input.useDirectorFlow,
  });

  if (limit <= 0) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'IMAGE_GENERATION_NOT_AVAILABLE',
      message: 'Image generation is not available in your plan',
      featureSlug: 'images_per_story',
      limit,
      used,
      allowedSceneIds,
    };
  }

  if (!allowedSceneIds.includes(input.sceneId)) {
    return {
      allowed: false,
      statusCode: 429,
      code: 'IMAGES_PER_STORY_LIMIT_EXCEEDED',
      message: 'This scene is outside your plan image allowance for this story',
      featureSlug: 'images_per_story',
      limit,
      used,
      allowedSceneIds,
    };
  }

  if (existingImageSceneIds.has(input.sceneId)) {
    return {
      allowed: true,
      allowedSceneIds,
    };
  }

  if (used >= limit) {
    return {
      allowed: false,
      statusCode: 429,
      code: 'IMAGES_PER_STORY_LIMIT_EXCEEDED',
      message: 'You have reached the image limit for this story',
      featureSlug: 'images_per_story',
      limit,
      used,
      allowedSceneIds,
    };
  }

  return {
    allowed: true,
    allowedSceneIds,
  };
}

export async function assertSceneImageGenerationAccessForStory(input: {
  story: Story;
  sceneId: number;
}): Promise<void> {
  const [userPlan, sceneRows] = await Promise.all([
    getPlanFeatures(input.story.userId),
    getSceneRepository().findByStoryId(input.story.id),
  ]);

  const storyScenes = Array.isArray(input.story.scenes) ? input.story.scenes : [];
  const totalScenes = storyScenes.length || sceneRows.length;
  const existingImageSceneIds = sceneRows
    .filter((scene) => !!scene.imageUrl)
    .map((scene) => scene.sceneId);

  const decision = evaluateSceneImageGenerationAccess({
    sceneId: input.sceneId,
    totalScenes,
    imagesPerStory: userPlan.imagesPerStory || 0,
    existingImageSceneIds,
    useDirectorFlow: config.features.useDirectorFlow,
  });

  if (decision.allowed === false) {
    throw new ImageStoryLimitError(decision);
  }
}

export async function assertSceneImageRegenerationAllowed(input: {
  storyId: string;
  userId: string;
  sceneId: number;
}): Promise<void> {
  const story = await getStoryRepository().findByIdAndUser(input.storyId, input.userId);
  if (!story) {
    throw new Error('Story not found');
  }
  await assertSceneImageGenerationAccessForStory({
    story,
    sceneId: input.sceneId,
  });
}
