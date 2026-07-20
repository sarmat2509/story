import assert from 'node:assert/strict';
import {
  MAX_SCENE_IMAGE_CHARACTERS,
  normalizeLegacySceneVisualCharacterRefs,
} from '../../domain/story/sceneCharacterLimits';
import { DIRECTOR_SCHEMA } from '../../domain/story/directorSchema';
import { mergeDirectorIntoText } from '../storyOrchestration/utilities';

function testDirectorSchemaHasHardCharacterCap() {
  const characterSchema = (((DIRECTOR_SCHEMA.properties?.illustrations as any).items.properties
    .sceneVisual.properties.cameraComposition.properties.characters) ?? {}) as {
    maxItems?: number;
  };

  assert.strictEqual(characterSchema.maxItems, MAX_SCENE_IMAGE_CHARACTERS);
}

function testMergeDirectorIntoTextKeepsChildWhenLimitingIllustrationCharacters() {
  const plainText = {
    title: 'Test',
    description: 'Desc',
    fullText: 'Scene text',
    wordCount: 2,
    scenes: [{ sceneId: 1, text: 'Everyone looks through the window.' }],
  };
  const directorResult = {
    characters: [],
    environments: [],
    outfits: [
      { id: 'o_a', characterName: 'A', description: 'natural appearance' },
      { id: 'o_b', characterName: 'B', description: 'natural appearance' },
      { id: 'o_c', characterName: 'C', description: 'natural appearance' },
      { id: 'o_d', characterName: 'D', description: 'natural appearance' },
      { id: 'o_e', characterName: 'E', description: 'natural appearance' },
    ],
    mapTile: { description: 'path', requiredFeatures: ['path'] },
    illustrations: [
      {
        environmentId: 'env_ship',
        primaryRead: 'A points at the window',
        sceneVisual: {
          setting: 'Spaceship cabin.',
          lighting: 'Cool ceiling light.',
          cameraComposition: {
            shot: 'Medium-wide shot.',
            characters: ['A', 'B', 'C', 'D', 'Child'].map((name) => ({
              name,
              description: `${name} is visible in the cabin.`,
              outfitId: `o_${name.toLowerCase()}`,
            })),
          },
        },
      },
    ],
  };

  const merged = mergeDirectorIntoText(plainText, directorResult, 1, {
    preferredCharacterNames: ['Child'],
  });
  const scene = merged.scenes[0];
  const cameraComposition = scene.sceneVisual.cameraComposition;

  assert.notStrictEqual(typeof cameraComposition, 'string');
  assert.deepStrictEqual(
    cameraComposition.characters.map((character: { name: string }) => character.name),
    ['A', 'B', 'Child'],
  );
  assert.strictEqual(cameraComposition.characters.length, MAX_SCENE_IMAGE_CHARACTERS);
  assert.deepStrictEqual(Object.keys(scene.characterOutfitIds), ['A', 'B', 'Child']);
}

function testLegacyDisplayIdBecomesStructuralCharacterRef() {
  const picoId = '808a4122-71ab-48f8-aca9-9c956f164e38';
  const normalized = normalizeLegacySceneVisualCharacterRefs({
    setting: 'Garden path.',
    lighting: 'Warm sunlight.',
    cameraComposition: {
      shot: 'Medium-wide shot.',
      characters: [
        {
          name: `Pico [ID: ${picoId}]`,
          description: 'Pico runs beside Maya.',
        },
        {
          characterRef: 'existing-ref',
          name: `Maya [ID: ignored-legacy-value]`,
          description: 'Maya smiles.',
        },
      ],
    },
  });

  assert.deepStrictEqual(normalized.cameraComposition.characters, [
    {
      characterRef: picoId,
      name: 'Pico',
      description: 'Pico runs beside Maya.',
    },
    {
      characterRef: 'existing-ref',
      name: 'Maya',
      description: 'Maya smiles.',
    },
  ]);
}

testDirectorSchemaHasHardCharacterCap();
testMergeDirectorIntoTextKeepsChildWhenLimitingIllustrationCharacters();
testLegacyDisplayIdBecomesStructuralCharacterRef();
console.log('sceneCharacterLimits tests passed');
