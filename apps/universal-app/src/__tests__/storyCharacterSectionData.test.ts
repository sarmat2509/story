import assert from 'node:assert/strict';
import { getStoryCharactersForSection } from '../screens/story/storyCharacterSectionData';

const storyCharacters = [
  {
    id: 'character-1',
    name: 'Current library name',
    type: 'imaginary',
    referencePhotoUrl: '/api/v1/assets/photos/character_front/character-1.jpg',
  },
];

const mergedCharacters = getStoryCharactersForSection({
  storyCharacters,
  manifestCharacters: [
    {
      id: 'character-1',
      name: 'Story snapshot name',
      type: 'imaginary',
      references: [
        {
          storagePath: 'photos/character_turnaround/character-1.jpg',
          isTurnaround: true,
        },
      ],
    },
  ],
  hasGraphicNovelPages: true,
});

assert.equal(
  mergedCharacters[0]?.referencePhotoUrl,
  '/api/v1/assets/photos/character_front/character-1.jpg',
  'comic sidebar should prefer the front preview resolved by the story API'
);
assert.equal(
  mergedCharacters[0]?.name,
  'Story snapshot name',
  'comic sidebar should preserve the historical name stored in the manifest'
);

const manifestOnlyCharacters = getStoryCharactersForSection({
  storyCharacters: [],
  manifestCharacters: [
    {
      characterRef: 'generated-character-1',
      name: 'Generated friend',
      references: [{ storagePath: 'llm_turnaround_cache/generated-character-1.jpg' }],
    },
  ],
  hasGraphicNovelPages: true,
});

assert.equal(
  manifestOnlyCharacters[0]?.referencePhotoUrl,
  'llm_turnaround_cache/generated-character-1.jpg',
  'manifest-only characters should keep their generation reference as a fallback'
);

assert.deepEqual(
  getStoryCharactersForSection({
    storyCharacters,
    manifestCharacters: [{ id: 'character-1', name: 'Manifest name', references: [] }],
    hasGraphicNovelPages: false,
  }),
  storyCharacters,
  'regular stories should continue to use the story API characters unchanged'
);

console.log('story character section data regression tests passed');
