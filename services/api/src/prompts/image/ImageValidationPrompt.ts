/**
 * Image Validation Prompt Builder
 * Generates prompts for post-generation image validation using Gemini Vision.
 * Detects character hallucinations, duplicates, missing characters, and description fidelity.
 */

import { stripCharacterIdFromName } from '@wondertales/shared';

export type ImageValidationCharacterKind = 'human' | 'animal' | 'imaginary';
export type ImageValidationReferenceKind = 'identity' | 'layout_template';
export type ImageValidationIdentitySource = 'turnaround' | 'reference_photo' | 'dressed_turnaround';

export interface ImageValidationPromptParams {
  expectedCharacters: Array<{
    name: string;
    characterKind: ImageValidationCharacterKind;
    /** Optional species/role hint (e.g. 'hamster', 'dragon', 'cat'). Input-only — not part of model output. */
    speciesSubtype?: string;
    description?: string;
    validateOutfit?: boolean;
  }>;
  sceneContext?: string;
  referenceImages?: Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
    referenceKind?: ImageValidationReferenceKind;
    identitySource?: ImageValidationIdentitySource;
  }>;
  /**
   * Enables extra layout QA fields for prepared graphic-novel pages:
   * art must stay inside panel boxes and must not overlap speech/thought bubbles.
   */
  includeLayoutChecks?: boolean;
  /**
   * Enables speech/thought/caption bubble overlap QA inside layout checks.
   * Art-only graphic-novel validation runs before server bubble placement and should disable this.
   */
  includeBubbleChecks?: boolean;
}

export const IMAGE_VALIDATION_CACHE_KEY_FULL = 'image_validation_rules_full_v20';
export const IMAGE_VALIDATION_CACHE_KEY_LITE = 'image_validation_rules_lite_v8';

function promptKindLabel(kind: ImageValidationCharacterKind): string {
  if (kind === 'animal') return 'ANIMAL';
  if (kind === 'imaginary') return 'IMAGINARY_CREATURE';
  return 'HUMAN';
}

function namesMatchForValidation(a: string, b: string): boolean {
  const na = stripCharacterIdFromName(a).trim().toLowerCase();
  const nb = stripCharacterIdFromName(b).trim().toLowerCase();
  return na === nb || a.trim().toLowerCase() === b.trim().toLowerCase();
}

function expectedRowForRefName(
  refName: string,
  expectedCharacters: ImageValidationPromptParams['expectedCharacters']
): ImageValidationPromptParams['expectedCharacters'][0] | undefined {
  return expectedCharacters.find((e) => namesMatchForValidation(e.name, refName));
}

function validationRefLabel(
  ref: NonNullable<ImageValidationPromptParams['referenceImages']>[number],
  imageIndex: number
): string {
  const role =
    ref.identitySource === 'dressed_turnaround'
      ? 'dressed turnaround identity reference'
      : ref.identitySource === 'turnaround'
        ? 'turnaround identity reference'
        : 'identity reference';
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
      displayName: IMAGE_VALIDATION_CACHE_KEY_LITE,
      content: `You are a quality assurance inspector for storybook illustrations.

Validate only what is observable in the generated illustration.

Without reference images:
- Check whether expected characters are present.
	- Check duplicates, unexpected characters, text/letters, and rendering artifacts.
	- Treat any leaked reference-sheet title, label, filename, watermark, or identifier (especially REF_* tokens such as REF_CH_*) in the generated illustration as unwanted text and set hasTextOrLetters=true.
- Use the authoritative designer scene brief as ground truth for this specific scene.
- Scene-specific states from the designer brief are valid: transparent, glowing, startled, mid-action, sleepy, flying, wet, dusty, magical, or otherwise temporarily changed characters.
- Identity failures require visible evidence available in this validation run.

	Output JSON rules:
	- characterKind must be exactly "human", "animal", or "imaginary" and MUST match the KIND listed for that name in the expected roster.
	- If a character row has WARDROBE_CHECK=disabled, set matchesOutfit=true for that character.
	- Because this run has no reference images, set faceMatchesReference, hairMatchesReference, ageReadMatchesReference, and proportionsMatchReference to null; omit sameOverallDesignRead and silhouetteDriftSeverity. Evaluate roster-description fidelity through found, recognizableScore, matchesColors, matchesOutfit, and issue.
- actualVisibleDescription is not a problem statement. When the expected character is missing or replaced by a wrong visible subject, describe the subject you actually see in Image 1 as a short concrete noun phrase, e.g. "small green person with a blue flower", "yellow chicken-like creature holding a twig", "girl with one thick side braid". Do not write what is missing, what should change, or how it differs from the reference; put those problems in issue / identityComparisonSummary.
- issue should list concrete observed problems separated by semicolons when needed.
- Report observable checks only. No aggregate pass/fail field. Return JSON only.`,
    };
  }

  return {
    key: IMAGE_VALIDATION_CACHE_KEY_FULL,
    displayName: IMAGE_VALIDATION_CACHE_KEY_FULL,
    content: `You are a quality assurance inspector for storybook illustrations.

Ground truth:
- Identity reference images are the visual ground truth for the whole referenced character look: face, hair, body proportions, silhouette, species/body type, palette, stable markings, visible clothing, shoes, and worn accessories when present. Held/carried props in the reference are temporary scene props, not mandatory identity anchors.
- Dressed turnaround identity references are scene-specific visual ground truth for both identity and wardrobe: face, hair, body proportions, silhouette, clothing, shoes, and worn accessories.
- Turnaround identity references are strict multi-view model sheets, not loose inspiration. Use all visible views to lock stable identity traits: face/head design, hairstyle silhouette, braid/ponytail/bun placement, distinctive hair color zones, proportions, body silhouette, and stable markings.
- No separate outfit plate or text outfit description is used for final scene validation.
- The authoritative designer scene brief is the ground truth for what is happening in THIS scene: expression, pose, action, emotion, temporary magical effects, transparency/opacity, glow, motion, and scene-specific presentation.
- Final scene validation does not use text outfit descriptions. Clothing, shoes, and worn accessories are checked only against the attached visual character reference. Held/carried props may change according to the authoritative designer scene brief.

Identity rules:
- HUMAN: highest-weight checks are face/head design, apparent character life-stage, visible hairstyle, then proportions/silhouette, then stable colors/markings.
- Before setting sameOverallDesignRead, derive a compact 3-8 item visual-anchor checklist from the reference image: distinctive anatomy/appendages, face/head marks, eyewear, hairstyle structure, color zones, stable markings, silhouette, clothing, shoes, and worn accessories visible in the reference. Handheld/carried props belong in this checklist only when the scene brief explicitly requires the same prop. Then check whether Image 1 preserves those anchors.
- When a named HUMAN has an identity reference, found=true means the named story character is visibly present, not merely that some generic human occupies the slot. If the generated person has a clearly different stable identity (for example a changed apparent life-stage, missing distinctive hairstyle/color zones, or generic substitute face/head), set found=false when the named character is not identifiable; otherwise set recognizableScore <= 0.5 and mark the relevant identity booleans false.
- HUMAN face must be evaluated as its own identity slot, separate from hairstyle, clothing, pose, and temporary expression. Set faceMatchesReference=false only when the face/head is visible enough to compare and the underlying identity differs: face/head shape, eye shape/spacing, nose, mouth, cheeks, jaw/chin, freckles/glasses/stable marks. If the face/head is hidden, turned away, cropped out, or too occluded to compare, set faceMatchesReference=null and say the face check was skipped; do not lower recognizableScore or create an issue for the hidden face alone. Still evaluate visible hairstyle, silhouette, proportions, wardrobe, and other identity anchors.
- HUMAN hair: broad color is not enough. Compare visible structure and color zones: hairline/parting, front locks/bangs, braid/ponytail/bun count, placement, high/low anchor point, loose-vs-braided sections, length/silhouette, and where accent colors sit. Any visible structural drift, such as a high back ponytail becoming front braids or one side braid, means hairMatchesReference=false.
- HUMAN face and hair fields must be independent: if the face matches but hair is structurally wrong, set faceMatchesReference=true and hairMatchesReference=false; if hair matches but the visible face/head identity drifts, set hairMatchesReference=true and faceMatchesReference=false; if the face is not visible enough to compare, set faceMatchesReference=null while still judging hair from visible hairstyle evidence.
- If HUMAN hairMatchesReference=false, recognizableScore cannot be 1.0. Do not claim "hair color/style matches" when only broad color matches but hairstyle structure or hair color zoning differs.
- ANIMAL: highest-weight checks are body type / silhouette, species read (e.g. hamster vs cat), head/muzzle shape, proportions, fur/feather pattern, and stable markings/coloration. For ANIMAL, interpret sameOverallDesignRead = same body type + species read, silhouetteDriftSeverity = body-proportions/silhouette drift, proportionsMatchReference = head-to-body ratio. Leave faceMatchesReference / hairMatchesReference / ageReadMatchesReference as null for animals — those are human identity slots.
- IMAGINARY_CREATURE: highest-weight checks are silhouette, body type, subtype read, head/muzzle shape, proportions, and signature markings/colors. Use the same sameOverallDesignRead / silhouetteDriftSeverity / proportionsMatchReference fields as animals; leave human-only identity booleans null.
- Matching clothes, palette, pose, or broad archetype cannot compensate for wrong identity.
- If first-glance design read drifts, recognizableScore must drop meaningfully.
- Temporary expression changes alone are NOT identity drift. A sad vs happy expression, different gaze direction, or scene-driven eyebrow/eyelid change should not materially lower recognizableScore if the same design is still obvious at first glance.
- For imaginary creatures, temporary expressive posing of flexible appendages (antennae, ears, whiskers, tail tip, crest tilt, wing angle) is not by itself a silhouette/body-type drift unless the appendage design itself changes or the first-glance creature read changes.
- Temporary scene-state changes authorized by the designer scene brief are NOT identity drift: transparency, shimmering outline, magical glow, aura, smoke/mist form, wet/muddy/snowy surface effects, startled/sleepy/excited expression, running/jumping/flying pose, or other clearly scene-driven presentation changes.
- Scene-specific held-object changes are NOT identity or outfit drift: if the reference shows a default object held in hands/paws/mouth, but the scene brief shows or implies another object (for example a map instead of a stick), do not fail sameOverallDesignRead, matchesOutfit, or issue because the default held object is absent/replaced.

Scoring guide:
- 1.0 only when there is no meaningful drift in face/head/muzzle shape, silhouette, body type, proportions, subtype read, or signature identity traits.
- 0.9 only for a single minor identity difference.
- 0.8 for two meaningful differences or mild visible design drift.
- 0.6-0.7 for noticeable silhouette/body-type/subtype drift while still clearly the same character.
- 0.5 or below for major silhouette change, wrong species slot, or strong reinterpretation.
- Lower recognizableScore is for stable visual design drift; scene emotions such as smiling, frowning, surprised, sleepy, or similar temporary expressions can still score high when the underlying design reads as the same character.

	Validation rules:
	- Compare colors only for stable identity colors, not clothing.
	- For character rows marked WARDROBE_CHECK=enabled, validate outfit against visible clothing, shoes, and worn accessories. For WARDROBE_CHECK=disabled rows, set matchesOutfit=true.
	- When the designer scene brief explicitly requests a temporary scene-state effect, evaluate fidelity to that brief first.
- Validate outfit against the attached full-character visual reference. When clothing, shoes, or worn accessories are visible in the reference, compare them as visual anchors; use matchesOutfit for the wardrobe verdict only when WARDROBE_CHECK=enabled. Held/carried props are wardrobe anchors only when the scene brief explicitly requires the same prop.
- Check duplicates, missing characters, unexpected characters, text/letters, and rendering artifacts.
- Treat any title, label, filename, watermark, or identifier copied from a reference image into the generated illustration as unwanted text. In particular, any visible REF_* token such as REF_CH_* requires hasTextOrLetters=true even when the rest of the illustration is correct.
- Apply scene-appropriate occlusion before failing outfit or visibility checks.

Output JSON rules:
- characterKind must be exactly "human", "animal", or "imaginary" and MUST match the KIND listed for that name in the expected roster. Do not answer "human" for a character listed as ANIMAL just because they appear small or cute.
- For HUMAN with an identity reference: hairMatchesReference, ageReadMatchesReference, proportionsMatchReference, and sameOverallDesignRead are expected booleans; faceMatchesReference is a boolean only when the face/head is visible enough to compare, otherwise null.
- For any character without its own IDENTITY mapping in VALIDATION MAPPING, do not claim a reference match: set faceMatchesReference, hairMatchesReference, ageReadMatchesReference, and proportionsMatchReference to null; omit sameOverallDesignRead and silhouetteDriftSeverity unless a true identity reference exists. Evaluate that character against the roster description and scene brief through found, recognizableScore, matchesColors, matchesOutfit, and issue.
- For HUMAN faceMatchesReference, evaluate the whole face/head identity from the identity reference, not isolated features, clothing, or hairstyle. Use null when the face/head is not observable enough; do not infer a match or mismatch from outfit, hair, name, or context.
- For HUMAN hairMatchesReference, broad hair color is insufficient. Changed braid/ponytail/bun count, placement, anchor point, loose-vs-braided structure, or accent-color placement means false.
- For ANIMAL / IMAGINARY_CREATURE: leave faceMatchesReference, hairMatchesReference, and ageReadMatchesReference as null (they are human identity slots). Use sameOverallDesignRead, silhouetteDriftSeverity, and proportionsMatchReference to express identity drift.
- Do not fail faceMatchesReference for temporary emotion alone when the same underlying face/head design is preserved, and do not fail it for hidden/occluded/back-view faces.
- identityComparisonSummary must state what matches, what differs, and whether the reference visual-anchor checklist / first-glance design read drifted. For HUMAN with an identity reference, explicitly mention face/head identity status separately from hairstyle status, including when the face check was skipped because the face/head is not visible.
- Clothing mismatch belongs in matchesOutfit / issue, and missing visible reference clothing/accessory anchors can also make sameOverallDesignRead=false.
- sameOverallDesignRead is true only when the reference visual-anchor checklist and overall dressed character read are preserved; set it false when important anchors from the reference are missing or visibly changed.
- silhouetteDriftSeverity is one of none | mild | moderate | severe.
- actualVisibleDescription is not a problem statement. When the expected character is missing or replaced by a wrong visible subject, describe the subject you actually see in Image 1 as a short concrete noun phrase, e.g. "small green person with a blue flower", "yellow chicken-like creature holding a twig", "girl with one thick side braid". Do not write what is missing, what should change, or how it differs from the reference; put those problems in issue / identityComparisonSummary.
- Report observable checks only. No aggregate pass/fail field. Return JSON only.`,
  };
}

export function buildImageValidationRuntimePrompt(params: ImageValidationPromptParams): string {
  const { expectedCharacters } = params;
  const refs =
    params.referenceImages && params.referenceImages.length > 0
      ? params.referenceImages.filter((ref) => ref.referenceKind !== 'layout_template')
      : [];

  const characterList =
    expectedCharacters.length > 0
      ? expectedCharacters
          .map((c, i) => {
            const kind = promptKindLabel(c.characterKind);
            const subtypeText = typeof c.speciesSubtype === 'string' ? c.speciesSubtype.trim() : '';
            const descriptionText = typeof c.description === 'string' ? c.description.trim() : '';
            const subtype = subtypeText ? ` | SUBTYPE=${subtypeText}` : '';
            const desc = descriptionText ? ` | ${descriptionText}` : '';
            const wardrobeCheck =
              c.validateOutfit === true
                ? ' | WARDROBE_CHECK=enabled'
                : ' | WARDROBE_CHECK=disabled';
            return `${i + 1}. "${c.name}" | KIND=${kind}${subtype}${desc}${wardrobeCheck}`;
          })
          .join('\n')
      : 'None';

  const kindTable =
    expectedCharacters.length > 0
      ? expectedCharacters
          .map((c) => `"${c.name}" => ${promptKindLabel(c.characterKind)}`)
          .join('\n')
      : 'None';

  const imageOrder = [
    'Image 1: generated illustration',
    ...refs.map((ref, i) => validationRefLabel(ref, i + 2)),
  ].join('\n');

  const characterReferenceMappings = refs
    .map((ref, i) => ({ ref, imageIndex: i + 2 }))
    .filter(({ ref }) => ref.referenceKind !== 'layout_template');

  const validationMapping =
    characterReferenceMappings.length > 0
      ? characterReferenceMappings
          .map(({ ref, imageIndex }) => {
            const row = expectedRowForRefName(ref.characterName, expectedCharacters);
            const kind = row ? promptKindLabel(row.characterKind) : 'CHARACTER';
            const role =
              ref.identitySource === 'dressed_turnaround'
                ? 'DRESSED_TURNAROUND'
                : ref.identitySource === 'turnaround'
                  ? 'IDENTITY_TURNAROUND'
                  : 'IDENTITY';
            return `"${ref.characterName}" -> Image ${imageIndex} [${kind}; ${role}]`;
          })
          .join('\n')
      : 'None';
  const includeBubbleChecks = params.includeBubbleChecks !== false;
  const layoutChecks = params.includeLayoutChecks
    ? [
        'GRAPHIC NOVEL LAYOUT CHECKS:',
        includeBubbleChecks
          ? '- Inspect panel boxes, gutters, page margins, speech bubbles, thought bubbles, caption boxes, bubble tails, outlines, and printed bubble text.'
          : '- Inspect panel boxes, gutters, and page margins.',
        '- Set hasArtworkOutsidePanelBounds=true if any illustration artwork, character, prop, background, color, shadow, or texture spills outside its intended panel box into gutters, margins, or another panel.',
        includeBubbleChecks
          ? '- Set hasArtworkOverSpeechBubbles=true if any illustration artwork, character, prop, background, color, shadow, or texture overlaps, covers, touches in a confusing way, or reduces readability of any speech/thought/caption bubble, bubble tail, outline, or bubble text.'
          : '',
        '- Set hasExtraPanelStructure=true if the generated page visually contains extra panels or extra scenes beyond the requested page structure: fake gutters, extra black/white dividers, inset panels, split-screen cuts, or one planned panel split into multiple different locations, camera shots, or sequential story beats.',
        '- If the scene brief says "exactly N panel boxes", the generated page must visually read as exactly N panels. A planned panel may contain rich composition, but it must remain one continuous illustration and one story moment.',
        includeBubbleChecks
          ? '- Artwork means illustrated scene content: characters, props, background, color, shadow, and texture.'
          : '- Artwork means illustrated scene content: characters, props, background, color, shadow, and texture.',
        includeBubbleChecks
          ? '- If all layout checks pass, set layoutFeedback to "ok". Otherwise describe the specific panel/bubble/extra-scene issue briefly.'
          : '- If all layout checks pass, set layoutFeedback to "ok". Otherwise describe the specific panel-boundary or extra-scene issue briefly.',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return [
    'Validate Image 1 against the expected character roster and return JSON only.',
    'For IDENTITY references: treat the attached image as the full visual character reference, including visible clothing, shoes, and worn accessories. Treat held/carried props as replaceable scene props unless the designer scene brief explicitly requires the same prop.',
    'For IDENTITY_TURNAROUND references: treat the image as a strict multi-view full-character model sheet. A generic substitute with different stable face/head/hair/proportions/clothing anchors is not the named character.',
    'For DRESSED_TURNAROUND references: treat the image as the scene-specific identity and wardrobe reference.',
    'AUTHORITATIVE PRIORITY: if the designer scene brief describes a temporary scene-specific state, that brief overrides the neutral/default state shown in identity references.',
    `EXPECTED CHARACTERS (${expectedCharacters.length}):`,
    characterList,
    'CHARACTER KIND TABLE:',
    kindTable,
    params.sceneContext ? `AUTHORITATIVE DESIGNER SCENE BRIEF:\n${params.sceneContext}` : '',
    `IMAGE ORDER:\n${imageOrder}`,
    `VALIDATION MAPPING:\n${validationMapping}`,
    'ACTUAL VISIBLE DESCRIPTION CONTRACT: actualVisibleDescription must describe the visible substitute/candidate currently in Image 1, not the validation problem. Use concrete visual words only. Good: "small green person with a blue flower". Bad: "missing leaf collar", "hair does not match", "wrong outfit", "should be the reference character".',
    layoutChecks,
  ]
    .filter(Boolean)
    .join('\n\n');
}
