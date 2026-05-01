import assert from 'node:assert';
import {
  buildStoryCreationAttribution,
  getStoryCreationAttributionInputFromRequest,
} from '../storyCreationAttributionService';

void (async function main() {
  assert.deepStrictEqual(
    buildStoryCreationAttribution(),
    {
      createdByMode: 'parent',
      createdByChildProfileId: null,
      parentReviewRequired: false,
      parentReviewStatus: 'not_required',
    },
    'parent stories use non-review defaults'
  );

  assert.deepStrictEqual(
    buildStoryCreationAttribution({
      createdByMode: 'child',
      createdByChildProfileId: 'child-1',
      parentReviewRequired: true,
    }),
    {
      createdByMode: 'child',
      createdByChildProfileId: 'child-1',
      parentReviewRequired: true,
      parentReviewStatus: 'pending',
    },
    'child stories requiring review are marked pending'
  );

  assert.deepStrictEqual(
    buildStoryCreationAttribution({
      createdByMode: 'child',
      fallbackChildProfileId: 'child-2',
      parentReviewRequired: false,
    }),
    {
      createdByMode: 'child',
      createdByChildProfileId: 'child-2',
      parentReviewRequired: false,
      parentReviewStatus: 'not_required',
    },
    'child attribution can fall back to the request child profile'
  );

  assert.throws(
    () => buildStoryCreationAttribution({ createdByMode: 'child' }),
    /createdByChildProfileId/,
    'child-created stories cannot omit child profile attribution'
  );

  assert.deepStrictEqual(
    getStoryCreationAttributionInputFromRequest({
      createdByMode: 'child',
      createdByChildProfileId: null,
      childProfileId: 'child-3',
      parentReviewRequired: true,
    }),
    {
      createdByMode: 'child',
      createdByChildProfileId: null,
      fallbackChildProfileId: 'child-3',
      parentReviewRequired: true,
    },
    'request rows map into attribution inputs'
  );

  console.log('storyCreationAttributionService tests passed');
})();
