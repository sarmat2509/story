import assert from 'node:assert/strict';
import { buildImageEditPrompt, buildImageEditSystemInstruction } from '../image/ImageEditPrompt';
import type { ImageValidationResult } from '../../ai/types';

const validation: ImageValidationResult = {
  characterCount: 1,
  expectedCharacterCount: 1,
  characters: [
    {
      name: 'Lera',
      characterKind: 'human',
      found: true,
      duplicated: false,
      recognizableScore: 0.7,
      matchesColors: true,
      matchesOutfit: false,
      faceMatchesReference: false,
      hairMatchesReference: false,
      ageReadMatchesReference: true,
      proportionsMatchReference: true,
      sameOverallDesignRead: false,
      silhouetteDriftSeverity: 'mild',
      issue: 'Face and hair drift from the reference.',
      identityComparisonSummary: 'Hair is a braid instead of the reference ponytail.',
    },
  ],
  hasUnexpectedCharacters: false,
  hasTextOrLetters: false,
  hasRenderingArtifacts: false,
  overallFeedback: 'Lera is recognizable, but the face and hair need repair.',
};

const prompt = buildImageEditPrompt({
  validationResult: validation,
  sceneDescription: 'SETTING: classroom',
});

assert.match(prompt, /VALIDATOR VERDICT:/);
assert.match(prompt, /Lera is recognizable, but the face and hair need repair\./);
assert.match(prompt, /PER-CHARACTER VALIDATOR OUTPUT:/);
assert.match(prompt, /"recognizableScore": 0\.7/);
assert.match(prompt, /Hair is a braid instead of the reference ponytail\./);
assert.match(prompt, /PERSON SOURCE images define the person/i);
assert.match(prompt, /CLOTHES SOURCE images define clothing\/accessories only/i);
assert.match(prompt, /draw the person from the PERSON SOURCE wearing the clothing\/accessories from the CLOTHES SOURCE/i);
assert.match(prompt, /Only clothing\/accessories should change/i);
assert.match(prompt, /Do not redesign, re-braid, re-style, simplify/i);
assert.match(prompt, /failed scene illustration.*NOT source of truth/i);
assert.match(prompt, /Restore the exact hairstyle structure from the identity reference/i);
assert.match(prompt, /SETTING: classroom/);

const systemInstruction = buildImageEditSystemInstruction();
assert.match(systemInstruction, /Use attached reference images only according to their labels/);
assert.doesNotMatch(systemInstruction, /\bif\b/i);
assert.doesNotMatch(systemInstruction, /\bwhen\b/i);
assert.doesNotMatch(systemInstruction, /\bor\b/i);
assert.doesNotMatch(systemInstruction, /Do not add text|speech bubbles|captions/i);

const targetedPrompt = buildImageEditPrompt({
  validationResult: {
    ...validation,
    characters: [
      ...validation.characters,
      {
        name: 'Magpie',
        characterKind: 'animal',
        found: true,
        duplicated: false,
        recognizableScore: 1,
        matchesColors: true,
        matchesOutfit: true,
        proportionsMatchReference: true,
        sameOverallDesignRead: true,
        silhouetteDriftSeverity: 'none',
      },
    ],
    overallFeedback: 'Lera needs hair repair. Magpie is perfect.',
  },
  sceneDescription: 'SETTING: classroom\nLIGHTING: daylight\nCAMERA: close-up',
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'hair', note: 'Hair is a braid instead of the reference ponytail.' }],
  },
});

assert.match(targetedPrompt, /Using the failed illustration as the base image, make only these edits:/);
assert.match(targetedPrompt, /Validator notes:/);
assert.match(targetedPrompt, /hair: Hair is a braid instead of the reference ponytail\./);
assert.match(targetedPrompt, /Change only the hairstyle of the matching visible subject to match the PERSON SOURCE for identity traits/);
assert.match(targetedPrompt, /hair color zoning/);
assert.match(targetedPrompt, /natural\/base color/);
assert.match(targetedPrompt, /dyed\/accent colors/);
assert.match(targetedPrompt, /Do not spread accent colors into natural\/base regions/);
assert.match(targetedPrompt, /Keep face\/head identity, clothing\/accessories, body proportions and silhouette, age read, stable identity colors, pose, style, lighting, composition, and background exactly the same/);
assert.match(targetedPrompt, /Keep everything else exactly the same/);
assert.match(targetedPrompt, /Do not add labels, captions, or any text\./);
assert.doesNotMatch(targetedPrompt, /REFERENCE USE/);
assert.doesNotMatch(targetedPrompt, /IMAGE ORDER/);
assert.doesNotMatch(targetedPrompt, /final attached image/i);
assert.doesNotMatch(targetedPrompt, /subject names as visual anchors/i);
assert.doesNotMatch(targetedPrompt, /Lera/);
assert.doesNotMatch(targetedPrompt, /Magpie/);
assert.doesNotMatch(targetedPrompt, /hairline|braid count|colored streak/i);
assert.doesNotMatch(targetedPrompt, /PER-CHARACTER VALIDATOR OUTPUT/);
assert.doesNotMatch(targetedPrompt, /EXPECTED CHARACTERS/);
assert.doesNotMatch(targetedPrompt, /VALIDATOR VERDICT/);
assert.doesNotMatch(targetedPrompt, /SETTING|LIGHTING|CAMERA/);

const combinedTraitPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [
      { kind: 'face', note: 'Face drifted from the source.' },
      { kind: 'hair', note: 'Hair drifted from the source.' },
    ],
  },
});

assert.match(combinedTraitPrompt, /Change only the face\/head identity and hairstyle of the matching visible subject to match the PERSON SOURCE for identity traits/);
assert.doesNotMatch(combinedTraitPrompt, /Change only the face\/head identity[\s\S]*Change only the hairstyle/);
assert.doesNotMatch(combinedTraitPrompt, /Keep face\/head identity/);
assert.doesNotMatch(combinedTraitPrompt, /Keep hairstyle/);
assert.match(combinedTraitPrompt, /face: Face drifted from the source\./);
assert.match(combinedTraitPrompt, /hair: Hair drifted from the source\./);

const combinedIdentityAndOutfitPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity_and_outfit',
    issues: [
      { kind: 'face', note: 'Face drifted from the source.' },
      { kind: 'hair', note: 'Hair drifted from the source.' },
      { kind: 'outfit', note: 'Outfit drifted from the source.' },
    ],
  },
});

assert.match(
  combinedIdentityAndOutfitPrompt,
  /Change only the face\/head identity, hairstyle, and clothing\/accessories of the matching visible subject to match the PERSON SOURCE for identity traits and the CLOTHES SOURCE for clothing\/accessories/
);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /Change only the clothing\/accessories[\s\S]*Keep face\/head identity/);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /Keep face\/head identity/);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /Keep hairstyle/);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /Keep clothing\/accessories/);

const headReplacementPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'head', note: 'Hair repair did not preserve color zoning.' }],
  },
});

assert.match(headReplacementPrompt, /Change only the head-and-hair identity of the matching visible subject/);
assert.match(headReplacementPrompt, /replace the entire visible head area from the PERSON SOURCE as one unit/);
assert.match(headReplacementPrompt, /Keep the scene expression, gaze direction, and head angle/);
assert.doesNotMatch(headReplacementPrompt, /Keep face\/head identity/);
assert.doesNotMatch(headReplacementPrompt, /Keep hairstyle/);
assert.doesNotMatch(headReplacementPrompt, /Keep stable identity colors/);

console.log('imageEditPrompt tests passed');
