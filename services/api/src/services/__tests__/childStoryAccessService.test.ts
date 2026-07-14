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
  'child sessions cannot read the full family library'
);

assert.equal(
  childSessionCanReadFamilyStories({
    sessionMode: 'child',
    sessionScopes: [FAMILY_STORIES_READ_SCOPE],
  }),
  true,
  'family-story scope unlocks the shared family library'
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
  'family-story scope removes the active-child library filter'
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

assert.equal(
  canReadStoryForSession(
    { sessionMode: 'child', childProfileId: 'child-1', sessionScopes: [] },
    { childProfileId: null, createdByChildProfileId: 'child-1' }
  ),
  true,
  'child sessions can read family stories created by their active child profile'
);

assert.equal(
  canReadStoryForSession(
    {
      sessionMode: 'child',
      childProfileId: 'child-1',
      sessionScopes: [FAMILY_STORIES_READ_SCOPE],
    },
    { childProfileId: 'child-2', createdByChildProfileId: null }
  ),
  true,
  'child sessions can read sibling stories when family-story access is enabled'
);

console.log('childStoryAccessService tests passed');
