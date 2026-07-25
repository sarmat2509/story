import assert from 'node:assert/strict';
import {
  getStoryCharacterSnapshotName,
  storyCharacterSnapshots,
} from '../storyCharacterSnapshot';

const snapshots = storyCharacterSnapshots({
  mergedCharacters: [
    {
      id: 'character-1',
      characterRef: 'character-1',
      childProfileId: 'child-1',
      name: 'Старое имя',
      canonicalName: 'Old canonical name',
    },
  ],
});

assert.equal(
  getStoryCharacterSnapshotName(snapshots, { id: 'character-1' }),
  'Старое имя',
  'story-linked character keeps the localized name captured during generation'
);
assert.equal(
  getStoryCharacterSnapshotName(snapshots, { id: 'missing', childProfileId: 'child-1' }),
  'Старое имя',
  'child profile fallback resolves the same immutable story snapshot'
);
assert.equal(
  getStoryCharacterSnapshotName(snapshots, { id: 'missing' }),
  null,
  'unknown character has no snapshot override'
);

console.log('story character snapshot tests passed');
