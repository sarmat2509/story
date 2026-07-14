import type { CreateStoryRequestInput } from '@wondertales/shared';
import { getStoryCharacterSelectionLimit } from '../domain/story/storyCharacterSelectionLimit';
import { getPlanFeatures } from './planService';

export class StoryCharacterSelectionLimitError extends Error {
  readonly code = 'STORY_CHARACTER_SELECTION_LIMIT_EXCEEDED';
  readonly statusCode = 400;
  readonly featureSlug = 'images_per_story';

  constructor(
    readonly limit: number,
    readonly selected: number,
    readonly imagesPerStory: number
  ) {
    super(`This plan allows up to ${limit} selected characters per story`);
    this.name = 'StoryCharacterSelectionLimitError';
  }
}

export function assertStoryCharacterSelectionLimitForImages(
  input: Pick<CreateStoryRequestInput, 'selectedCharacters' | 'selectedChildren'>,
  imagesPerStory: number
): { limit: number; selected: number } {
  const limit = getStoryCharacterSelectionLimit(imagesPerStory);
  const selected = new Set([
    ...(input.selectedCharacters ?? []),
    ...(input.selectedChildren ?? []),
  ]).size;
  if (selected > limit) {
    throw new StoryCharacterSelectionLimitError(limit, selected, imagesPerStory);
  }
  return { limit, selected };
}

export async function assertStoryCharacterSelectionLimit(
  userId: string,
  input: Pick<CreateStoryRequestInput, 'selectedCharacters' | 'selectedChildren'>
): Promise<{ limit: number; selected: number; imagesPerStory: number }> {
  const plan = await getPlanFeatures(userId);
  const result = assertStoryCharacterSelectionLimitForImages(input, plan.imagesPerStory);
  return { ...result, imagesPerStory: plan.imagesPerStory };
}

export function isStoryCharacterSelectionLimitError(
  error: unknown
): error is StoryCharacterSelectionLimitError {
  return error instanceof StoryCharacterSelectionLimitError;
}
