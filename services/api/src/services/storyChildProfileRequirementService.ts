import { getCharacterRepository, getChildProfileRepository } from '../repositories';

export class StoryChildProfileRequirementError extends Error {
  readonly statusCode = 400;

  constructor(
    readonly code:
      | 'CHILD_PROFILE_REQUIRED'
      | 'CHILD_PROFILE_NOT_FOUND'
      | 'CHILD_TURNAROUND_REQUIRED',
    message: string,
    readonly childProfileId?: string
  ) {
    super(message);
    this.name = 'StoryChildProfileRequirementError';
  }
}

/**
 * Parent-authored stories must have a live child profile for age and safety settings.
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

/** Block only when a selected story character represents a child without a visual model. */
export async function assertSelectedChildCharactersHaveTurnarounds(
  userId: string,
  selectedCharacterIds: string[] | undefined
): Promise<void> {
  if (!selectedCharacterIds?.length) return;

  const characters = await getCharacterRepository().findByIds(userId, selectedCharacterIds);
  const missing = characters.find((character) => {
    if (!character.childProfileId) return false;
    const turnaround = character.turnaroundSheet as { url?: unknown } | null | undefined;
    return typeof turnaround?.url !== 'string' || turnaround.url.trim().length === 0;
  });

  if (missing?.childProfileId) {
    throw new StoryChildProfileRequirementError(
      'CHILD_TURNAROUND_REQUIRED',
      'Complete the selected child character before creating a story',
      missing.childProfileId
    );
  }
}

export function isStoryChildProfileRequirementError(
  error: unknown
): error is StoryChildProfileRequirementError {
  return error instanceof StoryChildProfileRequirementError;
}
