import assert from 'node:assert/strict';
import {
  buildImageEditSystemInstruction,
  buildImageSystemInstruction,
  buildImageValidationRuntimePrompt,
  buildMapTilePromptParts,
  buildOutfitPlatePrompt,
  getImageValidationCachedPrefix,
  imageTextValidationPromptLines,
  shouldCheckImageReferenceLabels,
} from '../image';

const enabled = shouldCheckImageReferenceLabels();
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

assert.equal(enabled, true, 'Technical REF_* label leak detection is enabled');

for (const prompt of [systemInstruction, outfitPrompt, editInstruction, mapTileInstruction]) {
  assert.match(
    prompt,
    /Visible story-world text, signs, lettering, numbers, captions, and speech bubbles are allowed/,
    'Generation and edit prompts must allow ordinary visible text'
  );
  assert.match(prompt, /Never render technical reference identifiers or labels beginning with REF_/);
  assert.doesNotMatch(prompt, /no text, letters, numbers, labels/);
}

assert.strictEqual(
  cachedValidation.key.endsWith('_ref_label_check'),
  true
);
assert.match(
  cachedValidation.content,
  /Ordinary visible story-world text is allowed/
);
assert.match(
  cachedValidation.content,
  /SECRET_CAVERN \(REF_ENV\)/,
  'The known reference-label leak must be an explicit validator negative example'
);
assert.strictEqual(
  runtimeValidation.includes('Ordinary visible story-world text is allowed'),
  false,
  'The cached validator prefix owns the shared REF_* leak policy'
);
assert.match(
  imageTextValidationPromptLines().join('\n'),
  /only active meaning is a leaked technical reference identifier/
);
assert.match(imageTextValidationPromptLines().join('\n'), /literal REF_ prefix/);
assert.match(
  imageTextValidationPromptLines().join('\n'),
  /Do not infer a leak from garbled or unreadable ordinary writing/
);
assert.match(imageTextValidationPromptLines().join('\n'), /without a REF_\* identifier is allowed/);

console.log('imageTextPolicy tests passed');
