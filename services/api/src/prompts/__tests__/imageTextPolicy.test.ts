import assert from 'node:assert/strict';
import {
  buildImageEditSystemInstruction,
  buildImageSystemInstruction,
  buildImageValidationRuntimePrompt,
  buildMapTilePromptParts,
  buildOutfitPlatePrompt,
  getImageValidationCachedPrefix,
  imageTextValidationPromptLines,
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

assert.equal(enabled, true, 'Illustration-only output is a product invariant');

for (const prompt of [systemInstruction, outfitPrompt, editInstruction, mapTileInstruction]) {
  assert.match(
    prompt,
    /MUST OUTPUT ONLY the continuous storybook illustration/,
    'Generation and edit prompts must reject visible labels and descriptive blocks'
  );
}

assert.strictEqual(
  cachedValidation.key.endsWith('_text_check'),
  true
);
assert.match(
  cachedValidation.content,
  /title card, caption\/description\/information panel, legend\/key, reference-sheet\/contact-sheet layout/
);
assert.match(
  cachedValidation.content,
  /SECRET_CAVERN \(REF_ENV\)/,
  'The known reference-label leak must be an explicit validator negative example'
);
assert.strictEqual(
  runtimeValidation.includes('MUST OUTPUT ONLY the continuous storybook illustration'),
  false,
  'The cached validator prefix owns the shared illustration-only policy'
);
assert.match(
  imageTextValidationPromptLines().join('\n'),
  /Reject it even when its writing is too small or garbled to read/
);

console.log('imageTextPolicy tests passed');
