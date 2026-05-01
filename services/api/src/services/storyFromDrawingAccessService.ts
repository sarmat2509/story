import { hasFeature } from './planService';

export type StoryFromDrawingAccessCode = 'STORY_FROM_DRAWING_REQUIRED';

export type StoryFromDrawingAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      statusCode: 403;
      code: StoryFromDrawingAccessCode;
      message: string;
      featureSlug: 'story_from_drawing';
    };

export class StoryFromDrawingAccessError extends Error {
  readonly statusCode: 403;
  readonly code: StoryFromDrawingAccessCode;
  readonly featureSlug = 'story_from_drawing';

  constructor(decision: Exclude<StoryFromDrawingAccessDecision, { allowed: true }>) {
    super(decision.message);
    this.name = 'StoryFromDrawingAccessError';
    this.statusCode = decision.statusCode;
    this.code = decision.code;
  }
}

export function isStoryFromDrawingAccessError(error: unknown): error is StoryFromDrawingAccessError {
  return error instanceof StoryFromDrawingAccessError;
}

export function evaluateStoryFromDrawingAccess(input: {
  hasStoryFromDrawing: boolean;
  photoCount: number;
}): StoryFromDrawingAccessDecision {
  if (input.photoCount <= 0) {
    return { allowed: true };
  }

  if (input.hasStoryFromDrawing) {
    return { allowed: true };
  }

  return {
    allowed: false,
    statusCode: 403,
    code: 'STORY_FROM_DRAWING_REQUIRED',
    message: 'Your plan does not include story-from-drawing or photo-based generation',
    featureSlug: 'story_from_drawing',
  };
}

export async function assertStoryFromDrawingAccessForPhotos(input: {
  userId: string;
  photoCount: number;
}): Promise<void> {
  const decision = evaluateStoryFromDrawingAccess({
    photoCount: input.photoCount,
    hasStoryFromDrawing:
      input.photoCount > 0 ? await hasFeature(input.userId, 'story_from_drawing') : false,
  });

  if (decision.allowed === false) {
    throw new StoryFromDrawingAccessError(decision);
  }
}
