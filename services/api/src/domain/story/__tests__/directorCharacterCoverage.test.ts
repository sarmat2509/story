import assert from 'node:assert/strict';
import { evaluateDirectorSelectedCharacterCoverage } from '../directorCharacterCoverage';

function illustration(...names: string[]) {
  return {
    sceneVisual: {
      cameraComposition: {
        characters: names.map((name) => ({ name })),
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
    illustrations: [illustration('Emily [ID: emily-id]', 'Dad', 'Elderly Neighbor')],
    imagesPerStory: 1,
  }),
  {
    ok: false,
    missingCharacters: ['Рома [ID: roma-id]'],
  }
);

assert.deepEqual(
  evaluateDirectorSelectedCharacterCoverage({
    userCharacters: selected,
    illustrations: [illustration('Emily [ID: emily-id]'), illustration('Рома [ID: roma-id]')],
    imagesPerStory: 3,
  }),
  {
    ok: true,
    missingCharacters: [],
  }
);

assert.deepEqual(
  evaluateDirectorSelectedCharacterCoverage({
    userCharacters: [{ name: 'Luna' }],
    illustrations: [illustration('LUNA')],
    imagesPerStory: 1,
  }),
  {
    ok: true,
    missingCharacters: [],
  }
);

console.log('directorCharacterCoverage tests passed');
