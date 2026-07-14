export const BASIC_STORY_CHARACTER_SELECTION_LIMIT = 3;
export const STANDARD_STORY_CHARACTER_SELECTION_LIMIT = 5;

/**
 * Plans with a single illustration must fit every selected character into that
 * one image. Plans with multiple illustrations can distribute a larger cast.
 */
export function getStoryCharacterSelectionLimit(imagesPerStory: number): number {
  return Number.isFinite(imagesPerStory) && imagesPerStory > 1
    ? STANDARD_STORY_CHARACTER_SELECTION_LIMIT
    : BASIC_STORY_CHARACTER_SELECTION_LIMIT;
}
