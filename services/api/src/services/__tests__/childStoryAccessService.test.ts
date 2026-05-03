import assert from 'node:assert/strict';
import {
  FAMILY_STORIES_READ_SCOPE,
  NO_MATCH_CHILD_PROFILE_ID,
  canReadStoryForSession,
  childSessionCanReadFamilyStories,
  getChildScopedStoryFilter,
} from '../childStoryAccessService';

assert.equal(
  childSessionCanReadFamilyStories({ sessionMode: 'parent' }),
  true,
  'parent sessions can read the normal family library'
);

assert.equal(
  childSessionCanReadFamilyStories({ sessionMode: 'child', sessionScopes: [] }),
  false,
  'child sessions need an explicit family-story scope for full library access'
);

assert.equal(
  childSessionCanReadFamilyStories({
    sessionMode: 'child',
    sessionScopes: [FAMILY_STORIES_READ_SCOPE],
  }),
  true,
  'family-story scope unlocks full family-library reads'
);

assert.equal(
  getChildScopedStoryFilter({
    sessionMode: 'child',
    childProfileId: 'child-1',
    sessionScopes: [],
  }),
  'child-1',
  'child sessions without family-story scope are filtered to their active profile'
);

assert.equal(
  getChildScopedStoryFilter({ sessionMode: 'child', sessionScopes: [] }),
  NO_MATCH_CHILD_PROFILE_ID,
  'malformed child sessions cannot accidentally broaden library reads'
);

assert.equal(
  getChildScopedStoryFilter({
    sessionMode: 'child',
    childProfileId: 'child-1',
    sessionScopes: [FAMILY_STORIES_READ_SCOPE],
  }),
  undefined,
  'family-story scope removes the active-child filter'
);

assert.equal(
  canReadStoryForSession(
    { sessionMode: 'child', childProfileId: 'child-1', sessionScopes: [] },
    { childProfileId: 'child-1', createdByChildProfileId: null }
  ),
  true,
  'child sessions can read stories attached to their active child profile'
);

assert.equal(
  canReadStoryForSession(
    { sessionMode: 'child', childProfileId: 'child-1', sessionScopes: [] },
    { childProfileId: 'child-2', createdByChildProfileId: null }
  ),
  false,
  'child sessions cannot read sibling stories without family-story scope'
);

console.log('childStoryAccessService tests passed');
