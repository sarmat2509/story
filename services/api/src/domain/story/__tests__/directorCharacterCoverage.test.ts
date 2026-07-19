import assert from 'node:assert/strict';
import { evaluateDirectorSelectedCharacterCoverage } from '../directorCharacterCoverage';

function illustration(...characters: Array<{ characterRef: string; name: string }>) {
  return {
    sceneVisual: {
      cameraComposition: {
        characters,
      },
    },
  };
}

const selected = [
  { id: 'emily-id', name: 'Emily' },
  { id: 'roma-id', name: 'Рома' },
];

assert.deepEqual(
  evaluateDirectorSelectedCharacterCoverage({
    userCharacters: selected,
    illustrations: [illustration({ characterRef: 'emily-id', name: 'Emily' })],
    imagesPerStory: 1,
  }),
  {
    ok: false,
    missingCharacters: ['Рома (roma-id)'],
  }
);

assert.deepEqual(
  evaluateDirectorSelectedCharacterCoverage({
    userCharacters: selected,
    illustrations: [
      illustration({ characterRef: 'emily-id', name: 'Emily' }),
      illustration({ characterRef: 'roma-id', name: 'Рома' }),
    ],
    imagesPerStory: 3,
  }),
  {
    ok: true,
    missingCharacters: [],
  }
);

assert.deepEqual(
  evaluateDirectorSelectedCharacterCoverage({
    userCharacters: [{ characterRef: 'luna-id', name: 'Luna' }],
    illustrations: [illustration({ characterRef: 'luna-id', name: 'LUNA' })],
    imagesPerStory: 1,
  }),
  {
    ok: true,
    missingCharacters: [],
  }
);

console.log('directorCharacterCoverage tests passed');
