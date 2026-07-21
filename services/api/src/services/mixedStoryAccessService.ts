import { planAllowsComicFormats } from '@wondertales/shared';
import { getPlanFeatures } from './planService';

export class MixedStoryAccessError extends Error {
  readonly statusCode = 403;
  readonly code = 'MIXED_STORY_NOT_AVAILABLE';
  readonly featureSlug = 'mixed_stories_per_month';
  readonly limit: number;

  constructor(limit: number) {
    super('Story + comic is not available on this plan');
    this.name = 'MixedStoryAccessError';
    this.limit = limit;
  }
}

export function isMixedStoryAccessError(error: unknown): error is MixedStoryAccessError {
  return error instanceof MixedStoryAccessError;
}

export async function assertMixedStoryAccessAvailable(userId: string): Promise<void> {
  const features = await getPlanFeatures(userId);
  if (!planAllowsComicFormats(features.graphicNovelsPerMonth)) {
    throw new MixedStoryAccessError(features.graphicNovelsPerMonth);
  }
}
