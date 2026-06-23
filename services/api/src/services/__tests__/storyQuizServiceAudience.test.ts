import assert from 'node:assert';
import {
  ageGroupFromBirthDate,
  collectStoryQuizAudienceCandidateIds,
} from '../storyQuizService';

void (async function main() {
  assert.deepStrictEqual(
    collectStoryQuizAudienceCandidateIds(
      {
        childProfileId: 'self-story-child',
        createdByChildProfileId: null,
      },
      {
        selectedChildren: ['selected-child'],
        childProfileId: 'request-child',
        createdByChildProfileId: null,
      }
    ),
    ['selected-child', 'request-child', 'self-story-child'],
    'parent-created stories use selectedChildren before story.childProfileId'
  );

  assert.deepStrictEqual(
    collectStoryQuizAudienceCandidateIds(
      {
        childProfileId: 'child-mode-fallback',
        createdByChildProfileId: 'child-author',
      },
      {
        selectedChildren: [],
        childProfileId: 'request-child',
        createdByChildProfileId: 'request-author',
      }
    ),
    ['child-author', 'request-author', 'request-child', 'child-mode-fallback'],
    'child-created stories prefer explicit author attribution'
  );

  assert.strictEqual(
    ageGroupFromBirthDate('2017-07-16', new Date('2026-06-22T00:00:00.000Z')),
    '6-8',
    'an eight-year-old child maps to the 6-8 quiz bucket'
  );

  console.log('storyQuizServiceAudience tests passed');
})();
