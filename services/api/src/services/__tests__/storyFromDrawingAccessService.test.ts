import assert from 'node:assert/strict';
import {
  StoryFromDrawingAccessError,
  evaluateStoryFromDrawingAccess,
} from '../storyFromDrawingAccessService';

assert.deepStrictEqual(
  evaluateStoryFromDrawingAccess({
    hasStoryFromDrawing: false,
    photoCount: 0,
  }),
  { allowed: true },
  'non-photo flows do not require story_from_drawing access'
);

assert.deepStrictEqual(
  evaluateStoryFromDrawingAccess({
    hasStoryFromDrawing: true,
    photoCount: 2,
  }),
  { allowed: true },
  'photo-based flows are allowed when story_from_drawing is enabled'
);

assert.deepStrictEqual(
  evaluateStoryFromDrawingAccess({
    hasStoryFromDrawing: false,
    photoCount: 1,
  }),
  {
    allowed: false,
    statusCode: 403,
    code: 'STORY_FROM_DRAWING_REQUIRED',
    message: 'Your plan does not include story-from-drawing or photo-based generation',
    featureSlug: 'story_from_drawing',
  },
  'photo-based flows are blocked when story_from_drawing is disabled'
);

const blocked = evaluateStoryFromDrawingAccess({
  hasStoryFromDrawing: false,
  photoCount: 1,
});
assert.ok(!blocked.allowed);
const error = new StoryFromDrawingAccessError(blocked);
assert.strictEqual(error.statusCode, 403);
assert.strictEqual(error.code, 'STORY_FROM_DRAWING_REQUIRED');
assert.strictEqual(error.featureSlug, 'story_from_drawing');

console.log('storyFromDrawingAccessService tests passed');
