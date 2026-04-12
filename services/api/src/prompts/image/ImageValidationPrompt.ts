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
    referenceKind?: 'identity' | 'outfit_plate';
  }>;
}

export const IMAGE_VALIDATION_CACHE_KEY_FULL = 'image_validation_rules_full_v4';
export const IMAGE_VALIDATION_CACHE_KEY_LITE = 'image_validation_rules_lite_v2';

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

function validationRefLabel(
  ref: NonNullable<ImageValidationPromptParams['referenceImages']>[number],
  imageIndex: number,
): string {
  const role = ref.referenceKind === 'outfit_plate' ? 'outfit plate' : 'identity reference';
  return `Image ${imageIndex}: ${role} for "${ref.characterName}"`;
}

export function getImageValidationCachedPrefix(hasReferenceImages: boolean): {
  key: string;
  content: string;
  displayName: string;
} {
  if (!hasReferenceImages) {
    return {
      key: IMAGE_VALIDATION_CACHE_KEY_LITE,
      displayName: 'image_validation_rules_lite_v2',
      content: `You are a quality assurance inspector for children's book illustrations.

Validate only what is observable in the generated illustration.

Without reference images:
- Check whether expected characters are present.
- Check duplicates, unexpected characters, visible outfit mismatches, text/letters, and rendering artifacts.
- Use the authoritative designer scene brief and expected outfit text as ground truth for this specific scene.
- If the designer scene brief says a character is transparent, glowing, startled, mid-action, sleepy, flying, wet, dusty, magical, or otherwise temporarily changed by the scene, do NOT penalize that just because the neutral reference image shows a solid, calm, or default-state version.
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
    displayName: 'image_validation_rules_full_v4',
    content: `You are a quality assurance inspector for children's book illustrations.

Ground truth:
- Identity reference images are the ground truth for face, hair, body proportions, silhouette, species/body type, and stable markings. Unless an outfit plate is explicitly provided as clothing ground truth, ignore the clothing shown on identity reference images.
- The authoritative designer scene brief is the ground truth for what is happening in THIS scene: expression, pose, action, emotion, temporary magical effects, transparency/opacity, glow, motion, and scene-specific presentation.
- Scene context and "Expected outfit for THIS scene" are the ground truth for wardrobe.
- Do not fail outfit because it differs from the turnaround sheet when the scene wardrobe differs.
- If an outfit plate reference is provided for a character, that outfit plate is the strongest clothing ground truth for that character in this scene. Use scene outfit text as supporting clarification, not as a reason to fail a matching outfit plate.

Identity rules:
- HUMAN: highest-weight checks are face structure, age read, visible hairstyle, then proportions/silhouette, then stable colors/markings.
- IMAGINARY_CREATURE: highest-weight checks are silhouette, body type, subtype read, head/muzzle shape, proportions, and signature markings/colors.
- Matching clothes, palette, pose, or broad archetype cannot compensate for wrong identity.
- If first-glance design read drifts, recognizableScore must drop meaningfully.
- Temporary expression changes alone are NOT identity drift. A sad vs happy expression, different gaze direction, or scene-driven eyebrow/eyelid change should not materially lower recognizableScore if the same design is still obvious at first glance.
- For imaginary creatures, temporary expressive posing of flexible appendages (antennae, ears, whiskers, tail tip, crest tilt, wing angle) is not by itself a silhouette/body-type drift unless the appendage design itself changes or the first-glance creature read changes.
- Temporary scene-state changes authorized by the designer scene brief are NOT identity drift: transparency, shimmering outline, magical glow, aura, smoke/mist form, wet/muddy/snowy surface effects, startled/sleepy/excited expression, running/jumping/flying pose, or other clearly scene-driven presentation changes.

Scoring guide:
- 1.0 only when there is no meaningful drift in face/head/muzzle shape, silhouette, body type, proportions, subtype read, or signature identity traits.
- 0.9 only for a single minor identity difference.
- 0.8 for two meaningful differences or mild visible design drift.
- 0.6-0.7 for noticeable silhouette/body-type/subtype drift while still clearly the same character.
- 0.5 or below for major silhouette change, wrong species slot, or strong reinterpretation.
- Do NOT use a lower recognizableScore only because the character is smiling, frowning, surprised, sleepy, or otherwise emotionally different from the neutral reference, if the underlying design still reads as the same character.

Validation rules:
- Compare colors only for stable identity colors, not clothing.
- When the designer scene brief explicitly requests a temporary scene-state effect, evaluate fidelity to that brief first. Do not treat the neutral reference's default state as a contradiction.
- Validate outfit against scene wardrobe text only.
- If an outfit plate reference is present, validate outfit primarily against that plate's garment shapes, layers, and key colors/patterns. Do not fail just because the outfit differs from the neutral identity sheet when it matches the outfit plate.
- Never treat the clothing shown on an identity reference image as a mismatch by itself when the scene wardrobe or outfit plate authorizes different clothes.
- Check duplicates, missing characters, unexpected characters, text/letters, and rendering artifacts.
- Apply scene-appropriate occlusion before failing outfit or visibility checks.

Output JSON rules:
- characterKind must be exactly "human" or "imaginary".
- faceMatchesReference, hairMatchesReference, ageReadMatchesReference, proportionsMatchReference are required booleans.
- Do not fail faceMatchesReference for temporary emotion alone when the same underlying face/head design is preserved.
- identityComparisonSummary must state what matches, what differs, and whether first-glance design read drifted.
- Do NOT list wardrobe differences inside identityComparisonSummary when those differences are authorized by scene wardrobe text or by an outfit plate. Clothing mismatch belongs in matchesOutfit / issue, not in identity drift commentary.
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
    ...refs.map((ref, i) => validationRefLabel(ref, i + 2)),
  ].join('\n');

  const validationMapping = refs.length > 0
    ? refs
        .map((ref, i) => {
          const row = expectedRowForRefName(ref.characterName, expectedCharacters);
          const kind = row ? (row.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN') : 'UNKNOWN';
          const role = ref.referenceKind === 'outfit_plate' ? 'OUTFIT_PLATE' : 'IDENTITY';
          return `"${ref.characterName}" -> Image ${i + 2} [${kind}; ${role}]`;
        })
        .join('\n')
    : 'None';

  return [
    'Validate Image 1 against the expected character roster and return JSON only.',
    'For IDENTITY references: use them for identity only and ignore their clothing unless no separate outfit ground truth exists.',
    'AUTHORITATIVE PRIORITY: if the designer scene brief describes a temporary scene-specific state, that brief overrides the neutral/default state shown in identity references.',
    `EXPECTED CHARACTERS (${expectedCharacters.length}):`,
    characterList,
    'CHARACTER KIND TABLE:',
    kindTable,
    params.sceneContext ? `AUTHORITATIVE DESIGNER SCENE BRIEF:\n${params.sceneContext}` : '',
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
