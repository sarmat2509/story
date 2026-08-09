import assert from 'node:assert/strict';
import type { ImageValidationResult } from '../../ai/types';
import { buildImageEditPrompt } from '../../prompts/image/ImageEditPrompt';
import { buildSceneImagePrompt } from '../../prompts/image/ImagePrompts';
import { buildTargetedEditRepairPlan } from '../storyOrchestrationService';
import type { SceneData } from '../types';

function validationWithCharacter(
  overrides: Partial<ImageValidationResult['characters'][number]>
): ImageValidationResult {
  return {
    characterCount: 1,
    expectedCharacterCount: 1,
    characters: [
      {
        name: 'Emilia',
        characterKind: 'human',
        found: true,
        duplicated: false,
        recognizableScore: 0.72,
        faceMatchesReference: true,
        hairMatchesReference: false,
        ageReadMatchesReference: true,
        proportionsMatchReference: true,
        matchesColors: false,
        matchesOutfit: false,
        identityComparisonSummary:
          'Hair style, hair color, and clothing are incorrect versus the reference.',
        issue: 'Character design does not match the reference.',
        ...overrides,
      },
    ],
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    overallFeedback: 'Character needs repair.',
  };
}

const scene: SceneData = {
  sceneId: 1,
  text: 'Emilia kneels near the glowing egg.',
  sceneVisual: {
    setting: 'village square',
    lighting: 'soft morning light',
    cameraComposition: {
      shot: 'medium shot',
      characters: [
        {
          name: 'Emilia',
          description: 'center foreground, kneeling beside the glowing egg',
        },
      ],
    },
  },
};

const visibleSubjectValidation = validationWithCharacter({
  actualVisibleDescription: 'young girl with braided pastel hair and yellow sweater',
});
const visibleSubjectPlan = buildTargetedEditRepairPlan([], visibleSubjectValidation, scene);
const visibleReplacement = visibleSubjectPlan.manifest.subjectReplacements?.[0];

assert.equal(visibleReplacement?.characterName, 'Emilia');
assert.equal(
  visibleReplacement?.actualVisibleDescription,
  'young girl with braided pastel hair and yellow sweater'
);
assert.equal(visibleReplacement?.referenceId, undefined);

const visibleSubjectPrompt = buildImageEditPrompt({
  validationResult: visibleSubjectValidation,
  targetedRepairManifest: visibleSubjectPlan.manifest,
});

assert.match(
  visibleSubjectPrompt,
  /Replace only the existing visible subject described as "young girl with braided pastel hair and yellow sweater"/
);
assert.doesNotMatch(visibleSubjectPrompt, /Replace the entire matching visible subject/);
assert.doesNotMatch(visibleSubjectPrompt, /Validator notes:/);

const slotFallbackValidation = validationWithCharacter({ actualVisibleDescription: null });
const slotFallbackPlan = buildTargetedEditRepairPlan([], slotFallbackValidation, scene);
const slotReplacement = slotFallbackPlan.manifest.subjectReplacements?.[0];

assert.equal(
  slotReplacement?.sceneSlotDescription,
  'center foreground, kneeling beside the glowing egg'
);

const slotFallbackPrompt = buildImageEditPrompt({
  validationResult: slotFallbackValidation,
  targetedRepairManifest: slotFallbackPlan.manifest,
});

assert.match(
  slotFallbackPrompt,
  /Replace only the existing visible subject occupying this scene slot: "center foreground, kneeling beside the glowing egg"/
);
assert.doesNotMatch(slotFallbackPrompt, /Replace the entire matching visible subject/);

const unexpectedValidation = validationWithCharacter({
  recognizableScore: 1,
  faceMatchesReference: true,
  hairMatchesReference: true,
  ageReadMatchesReference: true,
  proportionsMatchReference: true,
  matchesColors: true,
  matchesOutfit: true,
  sameOverallDesignRead: true,
  identityComparisonSummary: 'All expected character anchors match.',
  issue: null,
  actualVisibleDescription: null,
});
unexpectedValidation.hasUnexpectedCharacters = true;
unexpectedValidation.unexpectedCharacterNotes =
  'An unidentified older man in a blue tracksuit is present on the left side of the frame.';
const unexpectedPlan = buildTargetedEditRepairPlan(
  [
    {
      characterName: 'Emilia',
      referenceBindingId: 'REF_CH_EMILIA_123',
      instructionText: 'Emilia dressed turnaround',
      source: 'character_outfit_turnaround',
      type: 'dressed_turnaround_reference',
      referenceKind: 'character',
      base64Data: 'aW1hZ2U=',
      mimeType: 'image/jpeg',
    },
  ],
  unexpectedValidation,
  scene
);

assert.deepEqual(unexpectedPlan.manifest.issues, [
  {
    kind: 'unexpected',
    note: 'An unidentified older man in a blue tracksuit is present on the left side of the frame.',
  },
]);
assert.deepEqual(unexpectedPlan.manifest.protectedSubjects, [
  { characterName: 'Emilia', referenceId: 'REF_CH_EMILIA_123' },
]);
assert.equal(unexpectedPlan.references?.length, 1);
assert.equal(unexpectedPlan.references?.[0]?.instructionText, 'REF_CH_EMILIA_123: identity');

const unexpectedPrompt = buildImageEditPrompt({
  validationResult: unexpectedValidation,
  targetedRepairManifest: unexpectedPlan.manifest,
});
assert.match(
  unexpectedPrompt,
  /Remove only the unexpected extra subject described as "An unidentified older man in a blue tracksuit is present on the left side of the frame\."/
);
assert.match(
  unexpectedPrompt,
  /Keep the expected characters matching REF_CH_EMILIA_123 unchanged; do not remove, replace, or redraw them\./
);
assert.doesNotMatch(unexpectedPrompt, /^1\. Remove only the unexpected extra subject\.$/m);

const compositionValidation = validationWithCharacter({
  recognizableScore: 1,
  faceMatchesReference: true,
  hairMatchesReference: true,
  ageReadMatchesReference: true,
  proportionsMatchReference: true,
  matchesColors: true,
  matchesOutfit: true,
  sameOverallDesignRead: true,
  identityComparisonSummary: 'All expected character anchors match.',
  issue: null,
});
compositionValidation.hasSceneCompositionMismatch = true;
compositionValidation.overallFeedback =
  'Two windows and multiple Moon-like celestial bodies are visible although the brief requires one window and the Moon.';
const compositionPlan = buildTargetedEditRepairPlan([], compositionValidation, scene);
const compositionPrompt = buildImageEditPrompt({
  validationResult: compositionValidation,
  targetedRepairManifest: compositionPlan.manifest,
});
assert.deepEqual(compositionPlan.manifest.issues, [
  {
    kind: 'composition',
    note: compositionValidation.overallFeedback,
  },
]);
assert.match(compositionPrompt, /Remove duplicate or extra windows, doors, portals, mirrors/);
assert.match(
  compositionPrompt,
  /Count every separate framed, curtained, or bordered night-sky opening as a window/
);

const forcedAnchorPlan = buildTargetedEditRepairPlan(
  [],
  unexpectedValidation,
  {
    ...scene,
    sceneVisual: {
      setting: 'The child rests beside the window.',
      lighting: 'night',
      cameraComposition: {
        shot: 'Keep the Moon visible through the window.',
        characters: [],
      },
    },
  },
  { enforceSceneAnchorCounts: true }
);
assert.equal(forcedAnchorPlan.manifest.issues[0]?.kind, 'composition');
assert.match(forcedAnchorPlan.manifest.issues[0]?.note || '', /exactly one window/);
assert.match(forcedAnchorPlan.manifest.issues[0]?.note || '', /exactly one Moon subject/);
assert.match(
  forcedAnchorPlan.manifest.issues[0]?.note || '',
  /inside the remaining existing window sky view/
);

const generationAnchorPrompt = buildSceneImagePrompt({
  sceneVisual: {
    setting: 'The child rests beside the window.',
    lighting: 'night',
    cameraComposition: {
      shot: 'Keep the Moon visible through the window.',
      characters: [],
    },
  },
  ageGroup: '4-5',
  style: 'watercolor',
});
assert.match(
  generationAnchorPrompt,
  /Exact scene counts: include exactly one window and exactly one Moon subject/
);
assert.match(
  generationAnchorPrompt,
  /Celestial placement: place the single Moon\/Sun character inside the existing window sky view/
);

console.log('targeted edit repair plan guards passed');
