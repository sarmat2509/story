/**
 * Unit tests for buildExpectedCharactersForValidation (3-way characterKind,
 * speciesSubtype, NFC name matching, visual wardrobe-check eligibility).
 *
 * Regression coverage for "hamster sent to validator as HUMAN" issue.
 *
 * Run: pnpm exec tsx src/services/__tests__/buildExpectedCharactersForValidation.test.ts
 */

import assert from 'node:assert/strict';
import type { CharacterData, SceneData } from '../types';
import { buildExpectedCharactersForValidation } from '../storyOrchestrationService';

function sceneWith(names: string[]): SceneData {
  return {
    sceneId: 1,
    text: 't',
    sceneVisual: {
      setting: 's',
      lighting: 'l',
      cameraComposition: {
        shot: 'wide',
        characters: names.map((n) => ({ name: n, description: 'center' })),
      },
    },
  };
}

function testHumanMapping() {
  const scene = sceneWith(['Emma']);
  const chars = [{ id: 'char-1', name: 'Emma', type: 'person', source: 'user_provided' } as CharacterData];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].characterKind, 'human');
  assert.strictEqual(out[0].validateOutfit, true);
}

function testChildMapping() {
  const scene = sceneWith(['Kiddo']);
  const chars = [
    { id: 'child-1', name: 'Kiddo', type: 'child', source: 'child_profile' } as CharacterData,
  ];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(out[0].characterKind, 'human');
  assert.strictEqual(out[0].validateOutfit, true);
}

function testLlmGeneratedHumanDoesNotValidateOutfit() {
  const scene = sceneWith(['Guide']);
  const chars = [
    { name: 'Guide', type: 'person', source: 'llm_generated' } as CharacterData,
  ];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(out[0].characterKind, 'human');
  assert.strictEqual(out[0].validateOutfit, false);
}

function testAnimalMapping_HamsterRegression() {
  // The original bug: an animal hamster was classified as human because we collapsed
  // animals under isImaginary=false. This must return characterKind='animal' now.
  const scene = sceneWith(["КРИХІТНИЙ ХОМ'ЯЧОК"]);
  const chars = [
    { name: "КРИХІТНИЙ ХОМ'ЯЧОК", type: 'animal', subtype: 'hamster' } as unknown as CharacterData,
  ];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].characterKind, 'animal');
  assert.strictEqual(out[0].speciesSubtype, 'hamster');
  assert.strictEqual(out[0].validateOutfit, false);
}

function testImaginaryMapping() {
  const scene = sceneWith(['Flash']);
  const chars = [
    { name: 'Flash', type: 'imaginary', subtype: 'dragon' } as unknown as CharacterData,
  ];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(out[0].characterKind, 'imaginary');
  assert.strictEqual(out[0].speciesSubtype, 'dragon');
  assert.strictEqual(out[0].validateOutfit, false);
}

function testUnknownTypeFallbacks() {
  // Unknown type + imaginary_friend ref source → imaginary.
  const scene = sceneWith(['Blip']);
  const chars = [{ name: 'Blip', type: 'other_unknown' } as unknown as CharacterData];
  const out1 = buildExpectedCharactersForValidation(scene, chars, [
    { source: 'imaginary_friend', characterName: 'Blip' },
  ]);
  assert.strictEqual(out1[0].characterKind, 'imaginary');

  // Unknown type + character_reference ref source → human (fallback).
  const out2 = buildExpectedCharactersForValidation(scene, chars, [
    { source: 'character_reference', characterName: 'Blip' },
  ]);
  assert.strictEqual(out2[0].characterKind, 'human');

  // No character data, no refs → human fallback.
  const out3 = buildExpectedCharactersForValidation(scene, [], []);
  assert.strictEqual(out3[0].characterKind, 'human');
}

function testIdSuffixInCompositionMatches() {
  // Scene has "Name [ID: uuid]" in cameraComposition; charData uses the plain name.
  const scene = sceneWith(['Emma [ID: abc-123]']);
  const chars = [{ name: 'Emma', type: 'child' } as CharacterData];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(out[0].characterKind, 'human');
  assert.strictEqual(out[0].validateOutfit, true);
  assert.strictEqual(out[0].name, 'Emma [ID: abc-123]');
}

function testValidationDescriptionStripsWardrobeText() {
  const scene = sceneWith(['Emilia']);
  const chars = [
    {
      name: 'Emilia',
      type: 'child',
      source: 'child_profile',
      descriptionEn:
        'Emilia has round green eyes, rosy cheeks, and long brown hair in a ponytail. She wears a dark floral bomber jacket, black crop top, patterned pants, and white sneakers.',
    } as unknown as CharacterData,
  ];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.match(out[0].description || '', /round green eyes/);
  assert.match(out[0].description || '', /long brown hair/);
  assert.doesNotMatch(
    out[0].description || '',
    /bomber|jacket|crop top|pants|sneakers/i
  );
}

function testNfcNfdNameMatching() {
  // Roster uses NFD form of Ukrainian name; charData uses NFC. After NFC-stripping
  // both should resolve to the same character (animal hamster), not fall back to human.
  const composed = "КРИХІТНИЙ ХОМ'ЯЧОК".normalize('NFC');
  const decomposed = composed.normalize('NFD');
  assert.notStrictEqual(composed, decomposed);

  const scene = sceneWith([decomposed]);
  const chars = [
    { name: composed, type: 'animal', subtype: 'hamster' } as unknown as CharacterData,
  ];
  const out = buildExpectedCharactersForValidation(scene, chars, []);
  assert.strictEqual(
    out[0].characterKind,
    'animal',
    'NFD name in scene must resolve to NFC charData'
  );
  assert.strictEqual(out[0].speciesSubtype, 'hamster');
}

testHumanMapping();
testChildMapping();
testLlmGeneratedHumanDoesNotValidateOutfit();
testAnimalMapping_HamsterRegression();
testImaginaryMapping();
testUnknownTypeFallbacks();
testIdSuffixInCompositionMatches();
testValidationDescriptionStripsWardrobeText();
testNfcNfdNameMatching();
console.log('buildExpectedCharactersForValidation tests passed');
