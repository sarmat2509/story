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
import { shouldCheckImageTextOrSymbols } from '../image/ImageTextPolicy';

function testCacheKeysBumped() {
  assert.strictEqual(
    IMAGE_VALIDATION_CACHE_KEY_FULL,
      `image_validation_rules_full_v26_${
      shouldCheckImageTextOrSymbols() ? 'text_check' : 'text_ignored'
    }`
  );
  assert.strictEqual(
    IMAGE_VALIDATION_CACHE_KEY_LITE,
      `image_validation_rules_lite_v14_${
      shouldCheckImageTextOrSymbols() ? 'text_check' : 'text_ignored'
    }`
  );

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
    full.content.includes('HUMAN hair: broad color is not enough'),
    'Full prompt should reject broad-color-only hair matches'
  );
  assert.ok(
    full.content.includes('hair color zoning'),
    'Full prompt should require hair color zoning comparison'
  );
  assert.ok(
    full.content.includes('high back ponytail becoming front braids'),
    'Full prompt should fail visible structural hairstyle drift'
  );
  assert.ok(
    full.content.includes('HUMAN face must be evaluated as its own identity slot'),
    'Full prompt should require separate human face evaluation'
  );
  assert.ok(
    full.content.includes('faceMatchesReference=null and say the face check was skipped'),
    'Full prompt should skip face comparison when the face/head is hidden'
  );
  assert.ok(
    full.content.includes('HUMAN face and hair fields must be independent'),
    'Full prompt should keep face and hair fields independent'
  );
  assert.ok(
    full.content.includes('No separate outfit plate or text outfit description is used for final scene validation.'),
    'Full prompt should reject separate outfit/text outfit validation inputs'
  );
  assert.ok(
    full.content.includes('Validate outfit against the attached full-character visual reference.'),
    'Full prompt should validate wardrobe only against full-character visual references'
  );
  assert.ok(
    full.content.includes('without its own IDENTITY mapping'),
    'Full prompt should forbid reference-match fields for unreferenced characters'
  );
  assert.ok(
    full.content.includes('Turnaround identity references are strict multi-view model sheets'),
    'Full prompt should treat turnaround sheets as strict identity ground truth'
  );
  assert.ok(
    full.content.includes('An unrequested tail, fin, wing, animal limb'),
    'Full prompt should treat invented human-anatomy transformations as severe identity drift'
  );
  assert.ok(
    full.content.includes('"swimming like a mermaid"'),
    'Full prompt should explicitly keep figurative swimming language from authorizing a mermaid tail'
  );
  assert.ok(
    lite.content.includes('Treat figurative action comparisons as movement direction'),
    'Lite prompt should reject unexpected transformations for expected humans even without references'
  );
  assert.ok(
    full.content.includes('camera is fully underwater in the basin'),
    'Full prompt should reject a generated exterior/top-down view that contradicts an underwater camera boundary'
  );
  assert.ok(
    lite.content.includes('camera and characters must be fully underwater inside the basin'),
    'Lite prompt should enforce explicit camera-medium constraints without reference images'
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

function testLayoutChecksAreFlaggedRuntimeOnly() {
  const withoutLayout = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: 'Mia', characterKind: 'human' }],
  });
  assert.ok(!withoutLayout.includes('GRAPHIC NOVEL LAYOUT CHECKS'));
  assert.ok(!withoutLayout.includes('hasArtworkOutsidePanelBounds'));
  assert.ok(!withoutLayout.includes('hasTemplateColorResidue'));

  const withLayout = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: 'Mia', characterKind: 'human' }],
    includeLayoutChecks: true,
  });
  assert.ok(withLayout.includes('GRAPHIC NOVEL LAYOUT CHECKS'));
  assert.ok(withLayout.includes('hasArtworkOutsidePanelBounds=true'));
  assert.ok(withLayout.includes('hasArtworkOverSpeechBubbles=true'));
  assert.ok(withLayout.includes('hasExtraPanelStructure=true'));
  assert.ok(withLayout.includes('exactly N panels'));
  assert.ok(withLayout.includes('layoutFeedback'));
  assert.ok(!withLayout.includes('hasTemplateColorResidue'));
  assert.ok(!withLayout.includes('color-coded guide-template fill'));
}

function testLayoutTemplateReferenceIsIgnored() {
  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: 'Mia', characterKind: 'human' }],
    referenceImages: [
      {
        characterName: 'Graphic novel page 3 layout template',
        mimeType: 'image/png',
        referenceKind: 'layout_template',
      },
      { characterName: 'Mia', mimeType: 'image/png', referenceKind: 'identity' },
    ],
    includeLayoutChecks: true,
    includeBubbleChecks: false,
  });

  assert.ok(!runtime.includes('layout template reference for the generated graphic novel page'));
  assert.ok(!runtime.includes('LAYOUT TEMPLATE REFERENCES'));
  assert.ok(!runtime.includes('Compare Image 1 against the listed layout template reference'));
  assert.ok(runtime.includes('"Mia" -> Image 2 [HUMAN; IDENTITY]'));
  assert.ok(!runtime.includes('"Graphic novel page 3 layout template" ->'));
  assert.ok(!runtime.includes('hasArtworkOverSpeechBubbles=true'));
}

function testTurnaroundIdentityReferenceIsExplicit() {
  const runtime = buildImageValidationRuntimePrompt({
    expectedCharacters: [{ name: 'Mia', characterKind: 'human' }],
    referenceImages: [
      {
        characterName: 'Mia',
        mimeType: 'image/png',
        referenceKind: 'identity',
        identitySource: 'turnaround',
      },
    ],
  });

  assert.ok(runtime.includes('Image 2: turnaround identity reference for "Mia"'));
  assert.ok(runtime.includes('"Mia" -> Image 2 [HUMAN; IDENTITY_TURNAROUND]'));
  assert.ok(runtime.includes('strict multi-view full-character model sheet'));
}

testCacheKeysBumped();
testKindRendering();
testSubtypeOnlyWhenProvided();
testValidationMappingFallback();
testNfcNameMatchingBetweenRosterAndRefs();
testLayoutChecksAreFlaggedRuntimeOnly();
testLayoutTemplateReferenceIsIgnored();
testTurnaroundIdentityReferenceIsExplicit();
console.log('imageValidationPromptKind tests passed');
