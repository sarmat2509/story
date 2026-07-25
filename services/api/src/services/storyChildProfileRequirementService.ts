import { getChildProfileRepository } from '../repositories';

export class StoryChildProfileRequirementError extends Error {
  readonly statusCode = 400;

  constructor(
    readonly code: 'CHILD_PROFILE_REQUIRED' | 'CHILD_PROFILE_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'StoryChildProfileRequirementError';
  }
}

/**
 * Parent-authored artisan, comic, and mixed stories must have a live child
 * profile. Child Mode and Instant Photo Stories deliberately have their own
 * route-specific profile rules, so they do not call this guard.
 */
export async function assertParentStoryChildProfile(
  userId: string,
  childProfileId: string | undefined
): Promise<void> {
  if (!childProfileId) {
    throw new StoryChildProfileRequirementError(
      'CHILD_PROFILE_REQUIRED',
      'Create or choose a child profile first'
    );
  }

  const profile = await getChildProfileRepository().findById(childProfileId, userId);
  if (!profile) {
    throw new StoryChildProfileRequirementError(
      'CHILD_PROFILE_NOT_FOUND',
      'Child profile not found'
    );
  }
}

export function isStoryChildProfileRequirementError(
  error: unknown
): error is StoryChildProfileRequirementError {
  return error instanceof StoryChildProfileRequirementError;
}
