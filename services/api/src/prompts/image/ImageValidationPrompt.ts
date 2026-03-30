/**
 * Image Validation Prompt Builder
 * Generates prompts for post-generation image validation using Gemini Vision.
 * Detects character hallucinations, duplicates, missing characters, and description fidelity.
 */

import { stripCharacterIdFromName } from '@wondertales/shared';

export interface ImageValidationPromptParams {
  expectedCharacters: Array<{
    name: string;
    isImaginary: boolean;
    description?: string;
    expectedOutfitForScene?: string;
  }>;
  sceneContext?: string;
  referenceImages?: Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
  }>;
}

export const IMAGE_VALIDATION_CACHE_KEY_FULL = 'image_validation_rules_full_v1';
export const IMAGE_VALIDATION_CACHE_KEY_LITE = 'image_validation_rules_lite_v1';

function namesMatchForValidation(a: string, b: string): boolean {
  const na = stripCharacterIdFromName(a).trim().toLowerCase();
  const nb = stripCharacterIdFromName(b).trim().toLowerCase();
  return na === nb || a.trim().toLowerCase() === b.trim().toLowerCase();
}

function expectedRowForRefName(
  refName: string,
  expectedCharacters: ImageValidationPromptParams['expectedCharacters'],
): ImageValidationPromptParams['expectedCharacters'][0] | undefined {
  return expectedCharacters.find((e) => namesMatchForValidation(e.name, refName));
}

export function getImageValidationCachedPrefix(hasReferenceImages: boolean): {
  key: string;
  content: string;
  displayName: string;
} {
  if (!hasReferenceImages) {
    return {
      key: IMAGE_VALIDATION_CACHE_KEY_LITE,
      displayName: 'image_validation_rules_lite_v1',
      content: `You are a quality assurance inspector for children's book illustrations.

Validate only what is observable in the generated illustration.

Without reference images:
- Check whether expected characters are present.
- Check duplicates, unexpected characters, visible outfit mismatches, text/letters, and rendering artifacts.
- Use scene text and expected outfit text as wardrobe ground truth.
- Do not invent identity failures that require a turnaround reference.

Output JSON rules:
- characterKind must be exactly "human" or "imaginary".
- For each character, fill all required booleans and scores conservatively.
- issue should list concrete observed problems separated by semicolons when needed.
- Report observable checks only. No aggregate pass/fail field. Return JSON only.`,
    };
  }

  return {
    key: IMAGE_VALIDATION_CACHE_KEY_FULL,
    displayName: 'image_validation_rules_full_v1',
    content: `You are a quality assurance inspector for children's book illustrations.

Ground truth:
- Reference images are the ground truth for identity.
- Scene context and "Expected outfit for THIS scene" are the ground truth for wardrobe.
- Do not fail outfit because it differs from the turnaround sheet when the scene wardrobe differs.

Identity rules:
- HUMAN: highest-weight checks are face structure, age read, visible hairstyle, then proportions/silhouette, then stable colors/markings.
- IMAGINARY_CREATURE: highest-weight checks are silhouette, body type, subtype read, head/muzzle shape, proportions, and signature markings/colors.
- Matching clothes, palette, pose, or broad archetype cannot compensate for wrong identity.
- If first-glance design read drifts, recognizableScore must drop meaningfully.

Scoring guide:
- 1.0 only when there is no meaningful drift in face/head/muzzle shape, silhouette, body type, proportions, subtype read, or signature identity traits.
- 0.9 only for a single minor identity difference.
- 0.8 for two meaningful differences or mild visible design drift.
- 0.6-0.7 for noticeable silhouette/body-type/subtype drift while still clearly the same character.
- 0.5 or below for major silhouette change, wrong species slot, or strong reinterpretation.

Validation rules:
- Compare colors only for stable identity colors, not clothing.
- Validate outfit against scene wardrobe text only.
- Check duplicates, missing characters, unexpected characters, text/letters, and rendering artifacts.
- Apply scene-appropriate occlusion before failing outfit or visibility checks.

Output JSON rules:
- characterKind must be exactly "human" or "imaginary".
- faceMatchesReference, hairMatchesReference, ageReadMatchesReference, proportionsMatchReference are required booleans.
- identityComparisonSummary must state what matches, what differs, and whether first-glance design read drifted.
- sameOverallDesignRead is true only when overall design read is unchanged.
- silhouetteDriftSeverity is one of none | mild | moderate | severe.
- Report observable checks only. No aggregate pass/fail field. Return JSON only.`,
  };
}

export function buildImageValidationRuntimePrompt(params: ImageValidationPromptParams): string {
  const { expectedCharacters } = params;
  const refs = params.referenceImages && params.referenceImages.length > 0 ? params.referenceImages : [];

  const characterList = expectedCharacters.length > 0
    ? expectedCharacters
        .map((c, i) => {
          const kind = c.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN';
          const desc = c.description ? `: ${c.description}` : '';
          const outfitLine = c.expectedOutfitForScene?.trim()
            ? ` | scene outfit: ${c.expectedOutfitForScene.trim()}`
            : '';
          return `${i + 1}. "${c.name}" | KIND=${kind}${desc}${outfitLine}`;
        })
        .join('\n')
    : 'None';

  const kindTable = expectedCharacters.length > 0
    ? expectedCharacters
        .map((c) => `"${c.name}" => ${c.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN'}`)
        .join('\n')
    : 'None';

  const imageOrder = [
    'Image 1: generated illustration',
    ...refs.map((ref, i) => `Image ${i + 2}: reference for "${ref.characterName}"`),
  ].join('\n');

  const validationMapping = refs.length > 0
    ? refs
        .map((ref, i) => {
          const row = expectedRowForRefName(ref.characterName, expectedCharacters);
          const kind = row ? (row.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN') : 'UNKNOWN';
          return `"${ref.characterName}" -> Image ${i + 2} [${kind}]`;
        })
        .join('\n')
    : 'None';

  return [
    'Validate Image 1 against the expected character roster and return JSON only.',
    `EXPECTED CHARACTERS (${expectedCharacters.length}):`,
    characterList,
    'CHARACTER KIND TABLE:',
    kindTable,
    params.sceneContext ? `SCENE CONTEXT:\n${params.sceneContext}` : '',
    `IMAGE ORDER:\n${imageOrder}`,
    `VALIDATION MAPPING:\n${validationMapping}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildImageValidationPrompt(params: ImageValidationPromptParams): string {
  const cached = getImageValidationCachedPrefix((params.referenceImages?.length ?? 0) > 0);
  return `${cached.content}\n\n${buildImageValidationRuntimePrompt(params)}`;
}
