/**
 * Unit tests for outfit plate eligibility helper.
 * Run: pnpm exec tsx src/services/__tests__/outfitPlateService.test.ts
 */

import assert from 'node:assert/strict';
import type { CharacterData } from '@wondertales/shared';
import {
  buildCharacterOutfitTurnaroundPrompt,
  isDefaultTurnaroundOutfit,
  isPregeneratedOutfitPlateCatalogSource,
  normalizeOutfitRequestText,
  outfitPlateEmbeddingSimilarity,
  requestedOutfitTextMatches,
  shouldGenerateOutfitPlateForCharacter,
  omitOutfitProseForNonHumanCharacters,
  shouldKeepDefaultOutfitForScene,
} from '../outfitPlateService';

function run() {
  assert.equal(shouldGenerateOutfitPlateForCharacter(undefined), false);
  assert.equal(shouldGenerateOutfitPlateForCharacter({ name: 'X' } as CharacterData), false);
  assert.equal(
    shouldGenerateOutfitPlateForCharacter({ name: 'X', type: '' } as CharacterData),
    false,
  );

  assert.equal(
    shouldGenerateOutfitPlateForCharacter({ name: 'Kid', type: 'child' } as CharacterData),
    true,
  );
  assert.equal(
    shouldGenerateOutfitPlateForCharacter({ name: 'Mom', type: 'person' } as CharacterData),
    true,
  );
  assert.equal(
    shouldGenerateOutfitPlateForCharacter({
      name: 'Lera',
      type: 'person',
      source: 'llm_generated',
    } as CharacterData),
    false,
  );

  assert.equal(
    shouldGenerateOutfitPlateForCharacter({ name: 'Dog', type: 'animal' } as CharacterData),
    false,
  );
  assert.equal(
    shouldGenerateOutfitPlateForCharacter({ name: 'Sprite', type: 'imaginary' } as CharacterData),
    false,
  );
  assert.equal(
    shouldGenerateOutfitPlateForCharacter({ name: 'Weird', type: 'unknown' } as CharacterData),
    false,
  );

  assert.equal(isDefaultTurnaroundOutfit('natural appearance'), true);
  assert.equal(isDefaultTurnaroundOutfit('same clothes'), true);
  assert.equal(isDefaultTurnaroundOutfit('A yellow raincoat'), false);
  assert.equal(isDefaultTurnaroundOutfit('A yellow raincoat', 'default'), true);
  assert.equal(
    normalizeOutfitRequestText('  Bright yellow   hooded raincoat.  '),
    'bright yellow hooded raincoat.'
  );
  assert.equal(
    requestedOutfitTextMatches(
      'Bright yellow hooded raincoat and matching yellow rubber boots.',
      ' bright yellow hooded raincoat and matching yellow rubber boots. '
    ),
    true
  );
  assert.equal(
    requestedOutfitTextMatches(
      'Dark floral jacket with striped leggings.',
      'Bright yellow hooded raincoat and matching yellow rubber boots.'
    ),
    false
  );
  assert.equal(outfitPlateEmbeddingSimilarity([1, 0], [1, 0]), 1);
  assert.equal(outfitPlateEmbeddingSimilarity([1, 0], [0, 1]), 0);
  assert.equal(outfitPlateEmbeddingSimilarity([1, 0], [1]), null);
  assert.equal(isPregeneratedOutfitPlateCatalogSource('outfits.json:planned'), true);
  assert.equal(isPregeneratedOutfitPlateCatalogSource('outfits-next-330.json:planned'), true);
  assert.equal(isPregeneratedOutfitPlateCatalogSource('outfits.json:existing'), false);
  assert.equal(isPregeneratedOutfitPlateCatalogSource(null), false);

  const mixed = {
    'Емілія [ID: aaa]': 'jacket',
    'Бінбон [ID: bbb]': 'sweater',
  };
  const chars = [
    { name: 'Емілія [ID: aaa]', type: 'child' },
    { name: 'Бінбон [ID: bbb]', type: 'imaginary' },
  ] as CharacterData[];
  const filtered = omitOutfitProseForNonHumanCharacters(mixed, chars);
  assert.deepEqual(filtered, { 'Емілія [ID: aaa]': 'jacket' });

  assert.deepEqual(
    omitOutfitProseForNonHumanCharacters({ Ghost: 'cloak' }, []),
    undefined,
    'no roster match: remove keys because outfits apply only to selected user humans',
  );
  assert.deepEqual(
    omitOutfitProseForNonHumanCharacters({ Ghost: 'cloak', Mom: 'dress' }, [
      { name: 'Mom', type: 'person' },
    ] as CharacterData[]),
    { Mom: 'dress' },
  );

  assert.equal(
    shouldKeepDefaultOutfitForScene({ defaultScore: 0.87, catalogScore: 0.89, tolerance: 0.03 }),
    true,
  );
  assert.equal(
    shouldKeepDefaultOutfitForScene({ defaultScore: 0.35, catalogScore: 0.93, tolerance: 0.03 }),
    false,
  );
  assert.equal(
    shouldKeepDefaultOutfitForScene({ defaultScore: 0.81, catalogScore: null, tolerance: 0.03 }),
    true,
  );

  const dressedPrompt = buildCharacterOutfitTurnaroundPrompt({
    characterName: 'Емілія',
    imageStyle: 'soft_3d',
    ageGroup: '6-8',
  });
  assert.ok(dressedPrompt.includes('Image 2 is wardrobe only'));
  assert.ok(!dressedPrompt.includes('Outfit to apply'));
  assert.ok(!dressedPrompt.toLowerCase().includes('raincoat'));
  assert.ok(!dressedPrompt.toLowerCase().includes('boots'));
}

run();
// eslint-disable-next-line no-console
console.log('outfitPlateService tests passed');
