export type StoryCreatedByMode = 'parent' | 'child';
export type ParentReviewStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface StoryCreationAttributionInput {
  createdByMode?: string | null;
  createdByChildProfileId?: string | null;
  fallbackChildProfileId?: string | null;
  parentReviewRequired?: boolean | null;
}

export interface StoryCreationAttribution {
  createdByMode: StoryCreatedByMode;
  createdByChildProfileId: string | null;
  parentReviewRequired: boolean;
  parentReviewStatus: ParentReviewStatus;
}

export function buildStoryCreationAttribution(
  input: StoryCreationAttributionInput = {}
): StoryCreationAttribution {
  const createdByMode: StoryCreatedByMode = input.createdByMode === 'child' ? 'child' : 'parent';
  const createdByChildProfileId = createdByMode === 'child'
    ? input.createdByChildProfileId || input.fallbackChildProfileId || null
    : null;

  if (createdByMode === 'child' && !createdByChildProfileId) {
    throw new Error('Child-created stories require createdByChildProfileId');
  }

  const parentReviewRequired = createdByMode === 'child' && input.parentReviewRequired === true;

  return {
    createdByMode,
    createdByChildProfileId,
    parentReviewRequired,
    parentReviewStatus: parentReviewRequired ? 'pending' : 'not_required',
  };
}

export function getStoryCreationAttributionInputFromRequest(request: {
  createdByMode?: string | null;
  createdByChildProfileId?: string | null;
  childProfileId?: string | null;
  parentReviewRequired?: boolean | null;
}): StoryCreationAttributionInput {
  return {
    createdByMode: request.createdByMode,
    createdByChildProfileId: request.createdByChildProfileId,
    fallbackChildProfileId: request.childProfileId,
    parentReviewRequired: request.parentReviewRequired,
  };
}
