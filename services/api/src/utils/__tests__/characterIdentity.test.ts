import assert from 'node:assert/strict';
import {
  buildCharacterIdentityRegistry,
  reconcileGeneratedCharacterIdentity,
  replaceTemporaryCharacterRefs,
  resolveCharacterRefByName,
  resolveRelationshipCharacterRefByName,
} from '../characterIdentity';

function testRelationshipAliasResolvesToExistingIdentity(): void {
  const document = {
    characters: [
      {
        characterRef: 'NEW_CH_1',
        name: 'Тато Тео [ID: legacy-value]',
        type: 'human',
        description: 'A kind adult.',
      },
    ],
    outfits: [
      {
        id: 'out_theo',
        characterRef: 'NEW_CH_1',
        characterName: 'Тато Тео [ID: legacy-value]',
        description: 'blue jacket',
      },
    ],
    pages: [
      {
        panels: [
          {
            dialogue: [
              { characterRef: 'NEW_CH_1', speaker: 'Тато Тео', text: 'Ходімо!' },
            ],
            visual: {
              sceneVisual: {
                cameraComposition: {
                  characters: [
                    {
                      characterRef: 'NEW_CH_1',
                      name: 'Тато Тео',
                      outfitId: 'out_theo',
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  };

  const replacements = reconcileGeneratedCharacterIdentity({
    document,
    existingCharacters: [
      {
        id: 'theo-uuid',
        characterRef: 'theo-uuid',
        name: 'Theo',
        canonicalName: 'Тео',
        nameAliases: ['Teo'],
      },
    ],
  });

  assert.equal(replacements.get('NEW_CH_1'), 'theo-uuid');
  assert.equal(document.characters[0].characterRef, 'theo-uuid');
  assert.equal(document.characters[0].name, 'Тато Тео');
  assert.equal(document.outfits[0].characterRef, 'theo-uuid');
  assert.equal(document.pages[0].panels[0].dialogue[0].characterRef, 'theo-uuid');
  assert.equal(
    document.pages[0].panels[0].visual.sceneVisual.cameraComposition.characters[0]
      .characterRef,
    'theo-uuid'
  );
}

function testTemporaryIdentityRewritesEveryUseAfterPersistence(): void {
  const document = {
    characters: [{ characterRef: 'NEW_CH_1', name: 'Tía Maela' }],
    outfits: [{ characterRef: 'NEW_CH_1' }],
    dialogue: [{ characterRef: 'NEW_CH_1', speaker: 'Tía Maela' }],
    camera: [{ characterRef: 'NEW_CH_1', name: 'Tia Maela' }],
    characterOutfitRefs: { NEW_CH_1: 'out_maela' },
  };
  replaceTemporaryCharacterRefs(document, new Map([['NEW_CH_1', 'maela-uuid']]));
  assert.deepEqual(
    [
      document.characters[0].characterRef,
      document.outfits[0].characterRef,
      document.dialogue[0].characterRef,
      document.camera[0].characterRef,
    ],
    ['maela-uuid', 'maela-uuid', 'maela-uuid', 'maela-uuid']
  );
  assert.deepEqual(document.characterOutfitRefs, { 'maela-uuid': 'out_maela' });
}

function testAmbiguousAliasFailsClosed(): void {
  assert.throws(
    () =>
      reconcileGeneratedCharacterIdentity({
        document: {
          characters: [
            { characterRef: 'NEW_CH_1', name: 'Aunt Alex', type: 'human', description: 'Adult.' },
          ],
          outfits: [],
        },
        existingCharacters: [
          { id: 'alex-1', name: 'Alex', nameAliases: ['Alex'] },
          { id: 'alex-2', name: 'Aleksandra', nameAliases: ['Alex'] },
        ],
      }),
    /Ambiguous existing-character alias/
  );
}

function testLocalizedTitlesResolveThroughAliases(): void {
  const registry = buildCharacterIdentityRegistry([
    {
      id: 'gable-uuid',
      name: 'Gable',
      nameAliases: ['Гейбл'],
    },
    {
      id: 'maela-uuid',
      name: 'Maela',
      nameAliases: ['Maela', 'Маела'],
    },
  ]);
  assert.deepEqual(resolveCharacterRefByName('Mrs. Gable', registry), {
    characterRef: 'gable-uuid',
    reason: 'relationship_alias',
  });
  assert.deepEqual(resolveCharacterRefByName('Tía Maela', registry), {
    characterRef: 'maela-uuid',
    reason: 'relationship_alias',
  });
  assert.deepEqual(resolveRelationshipCharacterRefByName('Mrs. Gable', registry), {
    characterRef: 'gable-uuid',
    reason: 'relationship_alias',
  });
}

testRelationshipAliasResolvesToExistingIdentity();
testTemporaryIdentityRewritesEveryUseAfterPersistence();
testAmbiguousAliasFailsClosed();
testLocalizedTitlesResolveThroughAliases();

console.log('characterIdentity tests passed');
