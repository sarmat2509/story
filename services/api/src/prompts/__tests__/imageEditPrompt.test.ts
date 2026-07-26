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
      actualVisibleDescription: 'a girl with one thick side braid and safari clothes',
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
assert.match(
  prompt,
  /Use labeled character references as the source for requested character replacements/i
);
assert.match(prompt, /replace the whole visible character with the matching labeled reference/i);
assert.doesNotMatch(prompt, /PERSON SOURCE images define the person/i);
assert.doesNotMatch(prompt, /CLOTHES SOURCE images define clothing\/accessories only/i);
assert.doesNotMatch(
  prompt,
  /draw the person from the PERSON SOURCE wearing the clothing\/accessories from the CLOTHES SOURCE/i
);
assert.match(prompt, /failed scene illustration.*NOT source of truth/i);
assert.match(prompt, /Restore the exact hairstyle structure from the identity reference/i);
assert.match(prompt, /SETTING: classroom/);

const systemInstruction = buildImageEditSystemInstruction();
assert.match(systemInstruction, /Follow the numbered edit instructions exactly/);
assert.match(systemInstruction, /Use REF_\* only to match attached reference images/);
assert.match(systemInstruction, /never draw REF_\* tokens/);
assert.match(systemInstruction, /MUST AVOID any kind of text/);
assert.match(systemInstruction, /Preserve composition, background, lighting, pose intent, style/);
assert.doesNotMatch(systemInstruction, /ABSOLUTE VISUAL TEXT BAN/);
assert.doesNotMatch(systemInstruction, /Reference labels are internal control tokens only/);
assert.doesNotMatch(systemInstruction, /Do not add/i);

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
    subjectReplacements: [
      {
        characterName: 'Lera',
        referenceId: 'REF_CH_LERA_TEST01',
        actualVisibleDescription: 'a girl with one thick side braid and safari clothes',
        validatorNote: 'Face and hair drift from the reference.',
        found: true,
        repairKinds: ['face', 'hair'],
      },
    ],
  },
});

assert.match(targetedPrompt, /Make these edits:/);
assert.match(
  targetedPrompt,
  /1\. Completely replace the visible subject described as "a girl with one thick side braid and safari clothes" with the full character from REF_CH_LERA_TEST01\./
);
assert.doesNotMatch(targetedPrompt, /Include the reference identity|Validator diagnosis/);
assert.match(targetedPrompt, /2\. Preserve everything else in the image\./);
assert.match(
  targetedPrompt,
  /3\. Add no unrelated new props or extra subjects\./
);
assert.doesNotMatch(targetedPrompt, /MUST AVOID any kind of text/);
assert.doesNotMatch(targetedPrompt, /Add no text|labels|captions|symbols/);
assert.doesNotMatch(
  targetedPrompt,
  /Keep the same scene slot|pose\/action intent|scale|lighting|art style|composition|background|every other character/
);
assert.doesNotMatch(targetedPrompt, /Keep everything else exactly the same/);
assert.doesNotMatch(targetedPrompt, /Do not add labels, captions, or any text\./);
assert.doesNotMatch(targetedPrompt, /Generate the corrected illustration/);
assert.doesNotMatch(targetedPrompt, /Validator notes:/);
assert.doesNotMatch(targetedPrompt, /hair: Hair is a braid instead of the reference ponytail\./);
assert.doesNotMatch(targetedPrompt, /Change only/);
assert.doesNotMatch(targetedPrompt, /PERSON SOURCE|CLOTHES SOURCE/);
assert.doesNotMatch(
  targetedPrompt,
  /skin\/hair|hair color zoning|natural\/base color|dyed\/accent colors/i
);
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

const multiReplacementPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'face', note: 'Multiple visible subjects drifted.' }],
    subjectReplacements: [
      {
        referenceId: 'REF_CH_EMILIA_C16C59',
        actualVisibleDescription: 'a young girl with rainbow-colored hair',
        found: true,
      },
      {
        characterName: 'Флеш',
        referenceId: 'REF_CH_FLESH_966AD7',
        sceneSlotDescription: 'right side near the glowing tree roots, hovering with a bright tail',
        found: true,
      },
    ],
  },
});

assert.match(
  multiReplacementPrompt,
  /Completely replace the visible subject described as "a young girl with rainbow-colored hair" with the full character from REF_CH_EMILIA_C16C59\./
);
assert.match(
  multiReplacementPrompt,
  /Completely replace the visible subject occupying this scene slot: "right side near the glowing tree roots, hovering with a bright tail" with the full character from REF_CH_FLESH_966AD7\./
);
assert.doesNotMatch(
  multiReplacementPrompt,
  /every other character|composition|background|pose\/action intent/
);
assert.doesNotMatch(multiReplacementPrompt, /Validator notes:/);

const combinedTraitPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [
      { kind: 'face', note: 'Face drifted from the source.' },
      { kind: 'hair', note: 'Hair drifted from the source.' },
    ],
    subjectReplacements: [
      {
        characterName: 'Lera',
        referenceId: 'REF_CH_LERA_TEST01',
        actualVisibleDescription: 'a girl with one thick side braid',
        found: true,
      },
    ],
  },
});

assert.match(
  combinedTraitPrompt,
  /Completely replace the visible subject described as "a girl with one thick side braid" with the full character from REF_CH_LERA_TEST01\./
);
assert.doesNotMatch(combinedTraitPrompt, /Change only/);
assert.doesNotMatch(combinedTraitPrompt, /PERSON SOURCE|CLOTHES SOURCE/);
assert.doesNotMatch(combinedTraitPrompt, /face: Face drifted from the source\./);
assert.doesNotMatch(combinedTraitPrompt, /hair: Hair drifted from the source\./);

const combinedIdentityAndOutfitPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity_and_outfit',
    issues: [
      { kind: 'face', note: 'Face drifted from the source.' },
      { kind: 'hair', note: 'Hair drifted from the source.' },
      { kind: 'outfit', note: 'Outfit drifted from the source.' },
    ],
    subjectReplacements: [
      {
        characterName: 'Lera',
        referenceId: 'REF_CH_LERA_DRESSED_TEST02',
        actualVisibleDescription: 'a girl with one thick side braid and safari clothes',
        found: true,
        repairKinds: ['face', 'hair', 'outfit'],
      },
    ],
  },
});

assert.match(
  combinedIdentityAndOutfitPrompt,
  /Completely replace the visible subject described as "a girl with one thick side braid and safari clothes" with the full character from REF_CH_LERA_DRESSED_TEST02\./
);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /Include the reference character design|signature props/);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /Change only/);
assert.doesNotMatch(combinedIdentityAndOutfitPrompt, /PERSON SOURCE|CLOTHES SOURCE/);
assert.doesNotMatch(
  combinedIdentityAndOutfitPrompt,
  /clothing\/accessories of the matching visible subject/
);

const headReplacementPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'head', note: 'Hair repair did not preserve color zoning.' }],
    subjectReplacements: [
      {
        characterName: 'Lera',
        referenceId: 'REF_CH_LERA_TEST01',
        found: true,
      },
    ],
  },
});

assert.match(
  headReplacementPrompt,
  /Completely replace the mismatched visible subject for the expected character slot with the full character from REF_CH_LERA_TEST01\./
);
assert.doesNotMatch(headReplacementPrompt, /visible subject for "Lera"/);
assert.doesNotMatch(
  headReplacementPrompt,
  /head-and-hair identity|visible head area|PERSON SOURCE/i
);
assert.doesNotMatch(headReplacementPrompt, /Keep face\/head identity/);
assert.doesNotMatch(headReplacementPrompt, /Keep hairstyle/);
assert.doesNotMatch(headReplacementPrompt, /Keep stable identity colors/);

const signaturePropPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'outfit', note: 'Missing leaf collar and flower prop.' }],
    subjectReplacements: [
      {
        characterName: 'Тік',
        referenceId: 'REF_CH_TIK_01DEB5',
        actualVisibleDescription:
          'The character is missing its signature leaf collar and the flower prop, and the ears are not visible.',
        validatorNote: 'Missing leaf collar and ears; missing flower prop.',
        found: true,
        repairKinds: ['outfit', 'design'],
      },
    ],
  },
});

assert.match(signaturePropPrompt, /full character from REF_CH_TIK_01DEB5/);
assert.match(
  signaturePropPrompt,
  /Completely replace the mismatched visible subject for the expected character slot with the full character from REF_CH_TIK_01DEB5\./
);
assert.doesNotMatch(signaturePropPrompt, /Visible subject to replace: "The character is missing/);
assert.doesNotMatch(signaturePropPrompt, /signature props that belong to that character/);
assert.doesNotMatch(signaturePropPrompt, /Validator diagnosis/);
assert.match(signaturePropPrompt, /unrelated new props/);
assert.doesNotMatch(signaturePropPrompt, /Add no text, labels, captions, symbols, new props, or extra subjects/);

const noReferenceLabelPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'colors', note: 'Wrong visible design.' }],
    subjectReplacements: [
      {
        characterName: 'Lera',
        actualVisibleDescription: 'young girl with braided pastel hair and yellow sweater',
        found: true,
      },
    ],
  },
});

assert.match(
  noReferenceLabelPrompt,
  /Completely replace the visible subject described as "young girl with braided pastel hair and yellow sweater" with the full character from the matching attached reference image\./
);
assert.doesNotMatch(noReferenceLabelPrompt, /Replace the validator-flagged mismatched visible subject/);

const sceneSlotFallbackPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'hair', note: 'Hair is incorrect.' }],
    subjectReplacements: [
      {
        characterName: 'Lera',
        referenceId: 'REF_CH_LERA_TEST01',
        sceneSlotDescription: 'center foreground, kneeling beside the glowing egg',
        found: true,
      },
    ],
  },
});

assert.match(
  sceneSlotFallbackPrompt,
  /Completely replace the visible subject occupying this scene slot: "center foreground, kneeling beside the glowing egg" with the full character from REF_CH_LERA_TEST01\./
);
assert.doesNotMatch(sceneSlotFallbackPrompt, /Replace the entire matching visible subject/);

const duplicateMissingSubjectPrompt = buildImageEditPrompt({
  validationResult: validation,
  targetedRepairManifest: {
    referenceMode: 'identity',
    issues: [{ kind: 'presence', note: 'Expected subject is missing.' }],
    subjectReplacements: [
      { found: false },
      { found: false },
    ],
  },
});

assert.equal(
  Array.from(
    duplicateMissingSubjectPrompt.matchAll(
      /Add the full character from the matching attached reference image to the expected scene slot\./g
    )
  ).length,
  1,
  'identical replacement actions must be emitted once'
);

console.log('imageEditPrompt tests passed');
