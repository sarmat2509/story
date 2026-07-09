import assert from 'node:assert/strict';
import type { ImageValidationResult } from '../../ai/types';
import { buildImageEditPrompt } from '../../prompts/image/ImageEditPrompt';
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
  /Completely replace the visible subject described as "young girl with braided pastel hair and yellow sweater"/
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
  /Completely replace the visible subject occupying this scene slot: "center foreground, kneeling beside the glowing egg"/
);
assert.doesNotMatch(slotFallbackPrompt, /Replace the entire matching visible subject/);

console.log('targeted edit repair plan guards passed');
