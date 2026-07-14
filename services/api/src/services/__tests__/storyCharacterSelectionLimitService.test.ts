import assert from 'node:assert/strict';
import { getStoryCharacterSelectionLimit } from '../../domain/story/storyCharacterSelectionLimit';
import {
  assertStoryCharacterSelectionLimitForImages,
  StoryCharacterSelectionLimitError,
} from '../storyCharacterSelectionLimitService';

assert.equal(getStoryCharacterSelectionLimit(0), 3);
assert.equal(getStoryCharacterSelectionLimit(1), 3);
assert.equal(getStoryCharacterSelectionLimit(3), 5);
assert.equal(getStoryCharacterSelectionLimit(5), 5);

assert.deepEqual(
  assertStoryCharacterSelectionLimitForImages({ selectedCharacters: ['a', 'b', 'c'] }, 1),
  { limit: 3, selected: 3 }
);
assert.deepEqual(
  assertStoryCharacterSelectionLimitForImages(
    { selectedCharacters: ['a', 'b', 'c', 'd', 'e'] },
    3
  ),
  { limit: 5, selected: 5 }
);
assert.deepEqual(
  assertStoryCharacterSelectionLimitForImages(
    { selectedCharacters: ['a', 'a', 'b'], selectedChildren: ['c'] },
    1
  ),
  { limit: 3, selected: 3 }
);

assert.throws(
  () =>
    assertStoryCharacterSelectionLimitForImages(
      { selectedCharacters: ['a', 'b'], selectedChildren: ['c', 'd'] },
      1
    ),
  (error: unknown) => {
    assert.ok(error instanceof StoryCharacterSelectionLimitError);
    assert.equal(error.limit, 3);
    assert.equal(error.selected, 4);
    assert.equal(error.imagesPerStory, 1);
    return true;
  }
);

console.log('storyCharacterSelectionLimitService tests passed');
