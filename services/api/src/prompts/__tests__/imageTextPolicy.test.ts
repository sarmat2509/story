import assert from 'node:assert/strict';
import {
  buildImageEditSystemInstruction,
  buildImageSystemInstruction,
  buildImageValidationRuntimePrompt,
  buildMapTilePromptParts,
  buildOutfitPlatePrompt,
  getImageValidationCachedPrefix,
  shouldCheckImageTextOrSymbols,
} from '../image';

const enabled = shouldCheckImageTextOrSymbols();
const systemInstruction = buildImageSystemInstruction({
  style: 'soft_watercolor',
  ageGroup: '6-8',
});
const outfitPrompt = buildOutfitPlatePrompt({
  outfitDescription: 'a red raincoat',
  imageStyle: 'soft watercolor',
  ageGroup: '6-8',
});
const editInstruction = buildImageEditSystemInstruction();
const mapTileInstruction = buildMapTilePromptParts({
  tileBrief: { description: 'A forest path' },
}).systemInstruction;
const cachedValidation = getImageValidationCachedPrefix(true);
const runtimeValidation = buildImageValidationRuntimePrompt({
  expectedCharacters: [],
});

for (const prompt of [
  systemInstruction,
  outfitPrompt,
  editInstruction,
  mapTileInstruction,
]) {
  assert.strictEqual(
    prompt.includes('MUST AVOID any kind of text'),
    enabled,
    'Generation and edit prompts must follow IMAGE_VALIDATION_CHECK_TEXT_OR_SYMBOLS'
  );
}

assert.strictEqual(
  cachedValidation.key.endsWith(enabled ? '_text_check' : '_text_ignored'),
  true
);
assert.strictEqual(
  cachedValidation.content.includes('Always set hasTextOrLetters=false'),
  !enabled
);
assert.strictEqual(
  runtimeValidation.includes('MUST AVOID any kind of text'),
  false,
  'Runtime roster prompt must not add an independent text ban'
);

console.log(`imageTextPolicy tests passed (${enabled ? 'enabled' : 'disabled'})`);
