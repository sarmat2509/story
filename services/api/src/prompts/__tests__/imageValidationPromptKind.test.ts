/**
 * Unit tests for the 3-way characterKind / speciesSubtype rendering in the image
 * validation prompt, plus NFC name matching between expected roster and references.
 *
 * Run: pnpm exec tsx src/prompts/__tests__/imageValidationPromptKind.test.ts
 */

import assert from 'node:assert/strict';
import {
  buildImageValidationRuntimePrompt,
  getImageValidationCachedPrefix,
  IMAGE_VALIDATION_CACHE_KEY_FULL,
  IMAGE_VALIDATION_CACHE_KEY_LITE,
} from '../image/ImageValidationPrompt';

function testCacheKeysBumped() {
  assert.strictEqual(IMAGE_VALIDATION_CACHE_KEY_FULL, 'image_validation_rules_full_v9');
  assert.strictEqual(IMAGE_VALIDATION_CACHE_KEY_LITE, 'image_validation_rules_lite_v3');

  const full = getImageValidationCachedPrefix(true);
  const lite = getImageValidationCachedPrefix(false);
  assert.strictEqual(full.key, IMAGE_VALIDATION_CACHE_KEY_FULL);
  assert.strictEqual(full.displayName, IMAGE_VALIDATION_CACHE_KEY_FULL);
  assert.strictEqual(lite.key, IMAGE_VALIDATION_CACHE_KEY_LITE);
  assert.strictEqual(lite.displayName, IMAGE_VALIDATION_CACHE_KEY_LITE);

  // Full prompt documents how to interpret identity fields for non-humans.
  assert.ok(full.content.includes('ANIMAL'), 'Full prompt should document ANIMAL identity rules');
  assert.ok(
    full.content.includes('IMAGINARY_CREATURE'),
    'Full prompt should document IMAGINARY_CREATURE identity rules'
  );
  assert.ok(
    full.content.includes('species read'),
    'Full prompt should mention species read for animals'
  );
  assert.ok(
    /null for animals|human identity slots/.test(full.content),
    'Full prompt should tell the model to leave human-identity slots null for non-humans'
  );
  assert.ok(
    full.content.includes('hairstyle must be compared structurally'),
    'Full prompt should require structural hairstyle comparison'
  );
  assert.ok(
    full.content.includes('hair color zoning'),
    'Full prompt should require hair color zoning comparison'
  );
  assert.ok(
    full.content.includes('places color streaks in the wrong hair sections'),
    'Full prompt should fail wrong placement of accent hair colors'
  );
  assert.ok(
    full.content.includes('HUMAN face must be evaluated as its own identity slot'),
    'Full prompt should require separate human face evaluation'
  );
  assert.ok(
    full.content.includes('HUMAN face and hair booleans must be independent'),
    'Full prompt should keep face and hair booleans independent'
  );
  assert.ok(
    full.content.includes('Outfit plates are clothing-only references'),
    'Full prompt should keep outfit plates from weakening identity checks'
  );
}

function testKindRendering() {
  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [
      { name: 'Mia', characterKind: 'human' },
      { name: 'Rex', characterKind: 'animal', speciesSubtype: 'hamster' },
      { name: 'Flash', characterKind: 'imaginary' },
    ],
  });

  assert.ok(runtime.includes('"Mia" | KIND=HUMAN'), 'Mia should render KIND=HUMAN');
  assert.ok(
    runtime.includes('"Rex" | KIND=ANIMAL | SUBTYPE=hamster'),
    'Rex should render KIND=ANIMAL with SUBTYPE=hamster'
  );
  assert.ok(
    runtime.includes('"Flash" | KIND=IMAGINARY_CREATURE'),
    'Flash should render KIND=IMAGINARY_CREATURE'
  );

  // CHARACTER KIND TABLE echoes the same mapping.
  assert.ok(runtime.includes('"Mia" => HUMAN'));
  assert.ok(runtime.includes('"Rex" => ANIMAL'));
  assert.ok(runtime.includes('"Flash" => IMAGINARY_CREATURE'));
}

function testSubtypeOnlyWhenProvided() {
  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: 'Rex', characterKind: 'animal' }],
  });
  assert.ok(runtime.includes('KIND=ANIMAL'));
  assert.ok(!runtime.includes('SUBTYPE='), 'No SUBTYPE line when speciesSubtype is omitted');
}

function testValidationMappingFallback() {
  // Reference has a name that is NOT in the expected roster — mapping should report
  // CHARACTER (not UNKNOWN) so the model still treats it as an identity reference.
  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: 'Mia', characterKind: 'human' }],
    referenceImages: [{ characterName: 'SomeoneElse', mimeType: 'image/png' }],
  });
  assert.ok(runtime.includes('VALIDATION MAPPING:'));
  assert.ok(runtime.includes('"SomeoneElse" -> Image 2 [CHARACTER; IDENTITY]'));
  assert.ok(!runtime.includes('UNKNOWN'), 'Mapping must not emit UNKNOWN for unfamiliar names');
}

function testNfcNameMatchingBetweenRosterAndRefs() {
  // Ukrainian "Й" has a canonical decomposition (И + combining breve). Scene roster
  // might carry the composed form while references carry the decomposed form (or vice
  // versa) depending on how the name was entered in the DB. After our stripCharacterId
  // NFC-normalization, both must map to the same character.
  const composed = "КРИХІТНИЙ ХОМ'ЯЧОК".normalize('NFC');
  const decomposed = composed.normalize('NFD');
  assert.notStrictEqual(composed, decomposed, 'NFC and NFD variants should differ in raw bytes');

  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: composed, characterKind: 'animal', speciesSubtype: 'hamster' }],
    referenceImages: [{ characterName: decomposed, mimeType: 'image/png' }],
  });

  assert.ok(runtime.includes('VALIDATION MAPPING:'));
  const mapping = runtime.split('VALIDATION MAPPING:')[1] ?? '';
  assert.ok(/ANIMAL/.test(mapping), 'Mapping must resolve NFD reference to ANIMAL from NFC roster');
  assert.ok(
    !mapping.includes('CHARACTER]'),
    'Mapping must not fall back to CHARACTER when names differ only by NFC/NFD'
  );
}

testCacheKeysBumped();
testKindRendering();
testSubtypeOnlyWhenProvided();
testValidationMappingFallback();
testNfcNameMatchingBetweenRosterAndRefs();
console.log('imageValidationPromptKind tests passed');
