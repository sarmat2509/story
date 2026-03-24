/**
 * Unit tests for outfit plate eligibility helper.
 * Run: pnpm exec tsx src/services/__tests__/outfitPlateService.test.ts
 */

import assert from 'node:assert/strict';
import type { CharacterData } from '@wondertales/shared';
import {
  shouldGenerateOutfitPlateForCharacter,
  omitOutfitProseForNonHumanCharacters,
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
    { Ghost: 'cloak' },
    'no roster match: keep keys (treat as human wardrobe from Director)',
  );
  assert.deepEqual(
    omitOutfitProseForNonHumanCharacters({ Ghost: 'cloak', Mom: 'dress' }, [
      { name: 'Mom', type: 'person' },
    ] as CharacterData[]),
    { Ghost: 'cloak', Mom: 'dress' },
  );
}

run();
// eslint-disable-next-line no-console
console.log('outfitPlateService tests passed');
