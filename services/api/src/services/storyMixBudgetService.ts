import { STORY_MIX_POINT_WEIGHTS } from '@wondertales/shared';

/**
 * Monthly story mix is charged in integer points so that the UI can safely
 * exchange comic and mixed-story capacity for ordinary stories without float
 * rounding changing an entitlement.
 */
export const STORY_MIX_POINTS = {
  story: STORY_MIX_POINT_WEIGHTS.story,
  mixed_story: STORY_MIX_POINT_WEIGHTS.mixedStory,
  graphic_novel: STORY_MIX_POINT_WEIGHTS.graphicNovel,
} as const;

export type StoryMixFormat = keyof typeof STORY_MIX_POINTS;

export function storyMixPointsForSource(source: string | null | undefined): number {
  if (source === 'graphic_novel') return STORY_MIX_POINTS.graphic_novel;
  if (source === 'mixed_story') return STORY_MIX_POINTS.mixed_story;
  return STORY_MIX_POINTS.story;
}

export function storyMixMaximum(params: {
  remainingPoints: number;
  otherQuantity: number;
  otherFormat: Exclude<StoryMixFormat, 'story'>;
  requestedFormat: Exclude<StoryMixFormat, 'story'>;
}): number {
  const available =
    params.remainingPoints - params.otherQuantity * STORY_MIX_POINTS[params.otherFormat];
  return Math.max(0, Math.floor(available / STORY_MIX_POINTS[params.requestedFormat]));
}

export function ordinaryStoriesFromRemainingPoints(points: number): number {
  return Math.max(0, Math.floor(points / STORY_MIX_POINTS.story));
}

export function readStoryMixBudgetPoints(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (value && typeof value === 'object' && 'limit' in value) {
    const limit = (value as { limit?: unknown }).limit;
    if (typeof limit === 'number' && Number.isFinite(limit)) return Math.max(0, Math.floor(limit));
  }
  return 0;
}
