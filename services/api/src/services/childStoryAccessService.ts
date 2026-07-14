export const FAMILY_STORIES_READ_SCOPE = 'family_stories:read';
export const NO_MATCH_CHILD_PROFILE_ID = '00000000-0000-0000-0000-000000000000';

export interface ChildStorySessionContext {
  sessionMode?: string;
  childProfileId?: string;
  sessionScopes?: string[];
}

export interface ChildReadableStoryRef {
  childProfileId?: string | null;
  createdByChildProfileId?: string | null;
}

export function childSessionCanReadFamilyStories(context: ChildStorySessionContext): boolean {
  return (
    context.sessionMode !== 'child' ||
    Boolean(context.sessionScopes?.includes(FAMILY_STORIES_READ_SCOPE))
  );
}

export function getChildScopedStoryFilter(context: ChildStorySessionContext): string | undefined {
  if (childSessionCanReadFamilyStories(context)) {
    return undefined;
  }

  return context.childProfileId ?? NO_MATCH_CHILD_PROFILE_ID;
}

export function canReadStoryForSession(
  context: ChildStorySessionContext,
  story: ChildReadableStoryRef
): boolean {
  if (childSessionCanReadFamilyStories(context)) {
    return true;
  }

  return Boolean(
    context.childProfileId &&
    (story.childProfileId === context.childProfileId ||
      story.createdByChildProfileId === context.childProfileId)
  );
}
