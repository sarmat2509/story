/**
 * Image Validation Prompt Builder
 * Generates prompts for post-generation image validation using Gemini Vision.
 * Detects character hallucinations, duplicates, missing characters, and description fidelity.
 */

import { stripCharacterIdFromName } from '@wondertales/shared';

export type ImageValidationCharacterKind = 'human' | 'animal' | 'imaginary';
export type ImageValidationReferenceKind = 'identity' | 'outfit_plate' | 'layout_template';
export type ImageValidationIdentitySource = 'turnaround' | 'reference_photo';

export interface ImageValidationPromptParams {
  expectedCharacters: Array<{
    name: string;
    characterKind: ImageValidationCharacterKind;
    /** Optional species/role hint (e.g. 'hamster', 'dragon', 'cat'). Input-only — not part of model output. */
    speciesSubtype?: string;
    description?: string;
    expectedOutfitForScene?: string;
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

export const IMAGE_VALIDATION_CACHE_KEY_FULL = 'image_validation_rules_full_v11';
export const IMAGE_VALIDATION_CACHE_KEY_LITE = 'image_validation_rules_lite_v4';

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
  if (ref.referenceKind === 'layout_template') {
    return `Image ${imageIndex}: layout template reference for the generated graphic novel page`;
  }
  const role =
    ref.referenceKind === 'outfit_plate'
      ? 'outfit plate'
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
      content: `You are a quality assurance inspector for children's book illustrations.

Validate only what is observable in the generated illustration.

Without reference images:
- Check whether expected characters are present.
- Check duplicates, unexpected characters, visible outfit mismatches, text/letters, and rendering artifacts.
- Use the authoritative designer scene brief and expected outfit text as ground truth for this specific scene.
- If the designer scene brief says a character is transparent, glowing, startled, mid-action, sleepy, flying, wet, dusty, magical, or otherwise temporarily changed by the scene, do NOT penalize that just because the neutral reference image shows a solid, calm, or default-state version.
- Do not invent identity failures that require a turnaround reference.

Output JSON rules:
- characterKind must be exactly "human", "animal", or "imaginary" and MUST match the KIND listed for that name in the expected roster. Do not reinterpret an animal as human.
- Because this run has no reference images, set faceMatchesReference, hairMatchesReference, ageReadMatchesReference, and proportionsMatchReference to null; omit sameOverallDesignRead and silhouetteDriftSeverity. Evaluate roster-description fidelity through found, recognizableScore, matchesColors, matchesOutfit, and issue.
- issue should list concrete observed problems separated by semicolons when needed.
- Report observable checks only. No aggregate pass/fail field. Return JSON only.`,
    };
  }

  return {
    key: IMAGE_VALIDATION_CACHE_KEY_FULL,
    displayName: IMAGE_VALIDATION_CACHE_KEY_FULL,
    content: `You are a quality assurance inspector for children's book illustrations.

Ground truth:
- Identity reference images are the ground truth for face, hair, body proportions, silhouette, species/body type, stable markings, and default clothing when no separate clothing ground truth is supplied. If scene wardrobe text or an outfit plate is supplied, do not use identity-reference clothing as wardrobe ground truth for that character.
- Turnaround identity references are strict multi-view model sheets, not loose inspiration. Use all visible views to lock stable identity traits: face/head read, hairstyle silhouette, braid/ponytail/bun placement, distinctive hair color zones, proportions, body silhouette, and stable markings.
- Outfit plates are clothing-only references. They never replace or weaken identity requirements from the identity reference image: face, age read, hairstyle, hair silhouette, body proportions, and stable marks still come from the identity reference.
- The authoritative designer scene brief is the ground truth for what is happening in THIS scene: expression, pose, action, emotion, temporary magical effects, transparency/opacity, glow, motion, and scene-specific presentation.
- Scene context and "Expected outfit for THIS scene" are wardrobe ground truth only when supplied.
- If no outfit plate and no expected outfit text is supplied for a referenced character, the identity reference/default clothes are the wardrobe ground truth.
- If an outfit plate reference is provided for a character, that outfit plate is the strongest clothing ground truth for that character in this scene.

Identity rules:
- HUMAN: highest-weight checks are face structure, age read, visible hairstyle, then proportions/silhouette, then stable colors/markings.
- When a named HUMAN has an identity reference, found=true means the named character is visibly present, not merely that some generic human occupies the slot. If the generated person has a clearly different stable identity (for example wrong age read, missing distinctive hairstyle/color zones, or generic substitute face/head), set found=false when the named character is not identifiable; otherwise set recognizableScore <= 0.5 and mark the relevant identity booleans false.
- HUMAN face must be evaluated as its own identity slot, separate from hairstyle, clothing, pose, and temporary expression. Set faceMatchesReference=false when the underlying face/head identity differs: face/head shape, eye shape/spacing, nose, mouth, cheeks, jaw/chin, freckles/glasses/stable marks. Do not make faceMatchesReference=false only because the hairstyle is wrong or because the character has a scene-driven expression/gaze.
- HUMAN hairstyle must be compared structurally and by color zoning, not by broad hair color alone: hairline/parting, bangs/front locks, number and placement of braids/ponytails/buns, braid thickness, loose-vs-tied sections, length, side placement, natural/base-color regions, dyed/accent-color regions, and distinctive colored streak placement all matter. If the identity reference has multiple/front braids or a high ponytail but the generated image has one thick braid, a single side braid, or a simplified braid silhouette, set hairMatchesReference=false and mention that concrete drift. If the generated image spreads accent colors into natural/base hair regions, removes accent colors from dyed/accent regions, or places color streaks in the wrong hair sections, set hairMatchesReference=false and mention hair color placement drift.
- HUMAN face and hair booleans must be independent: if the face matches but hair is structurally wrong, set faceMatchesReference=true and hairMatchesReference=false; if hair matches but the face/head identity drifts, set hairMatchesReference=true and faceMatchesReference=false.
- If HUMAN hairMatchesReference=false, recognizableScore cannot be 1.0. Do not claim "hair color/style matches" when only broad color matches but hairstyle structure or hair color zoning differs.
- ANIMAL: highest-weight checks are body type / silhouette, species read (e.g. hamster vs cat), head/muzzle shape, proportions, fur/feather pattern, and stable markings/coloration. For ANIMAL, interpret sameOverallDesignRead = same body type + species read, silhouetteDriftSeverity = body-proportions/silhouette drift, proportionsMatchReference = head-to-body ratio. Leave faceMatchesReference / hairMatchesReference / ageReadMatchesReference as null for animals — those are human identity slots.
- IMAGINARY_CREATURE: highest-weight checks are silhouette, body type, subtype read, head/muzzle shape, proportions, and signature markings/colors. Use the same sameOverallDesignRead / silhouetteDriftSeverity / proportionsMatchReference fields as animals; leave human-only identity booleans null.
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
- Validate outfit against the outfit plate when one is present; otherwise validate against scene wardrobe text when supplied; otherwise keep identity reference/default clothes for referenced characters.
- If an outfit plate reference is present, validate outfit primarily against that plate's garment shapes, layers, and key colors/patterns.
- Never treat the clothing shown on an identity reference image as a mismatch by itself when scene wardrobe text or an outfit plate authorizes different clothes.
- Check duplicates, missing characters, unexpected characters, text/letters, and rendering artifacts.
- Apply scene-appropriate occlusion before failing outfit or visibility checks.

Output JSON rules:
- characterKind must be exactly "human", "animal", or "imaginary" and MUST match the KIND listed for that name in the expected roster. Do not answer "human" for a character listed as ANIMAL just because they appear small or cute.
- For HUMAN with an identity reference: faceMatchesReference, hairMatchesReference, ageReadMatchesReference, proportionsMatchReference are expected booleans.
- For any character without its own IDENTITY mapping in VALIDATION MAPPING, do not claim a reference match: set faceMatchesReference, hairMatchesReference, ageReadMatchesReference, and proportionsMatchReference to null; omit sameOverallDesignRead and silhouetteDriftSeverity unless a true identity reference exists. Evaluate that character against the roster description and scene brief through found, recognizableScore, matchesColors, matchesOutfit, and issue.
- For HUMAN faceMatchesReference, evaluate the whole face/head identity from the identity reference, not isolated features, clothing, or hairstyle.
- For HUMAN hairMatchesReference, evaluate hairstyle structure and hair color zoning against the identity reference even when an outfit plate is present. A matching outfit, broad hair color, or overall palette must not turn a structurally different hairstyle or wrong hair color placement into hairMatchesReference=true.
- For ANIMAL / IMAGINARY_CREATURE: leave faceMatchesReference, hairMatchesReference, and ageReadMatchesReference as null (they are human identity slots). Use sameOverallDesignRead, silhouetteDriftSeverity, and proportionsMatchReference to express identity drift.
- Do not fail faceMatchesReference for temporary emotion alone when the same underlying face/head design is preserved.
- identityComparisonSummary must state what matches, what differs, and whether first-glance design read drifted. For HUMAN with an identity reference, explicitly mention face/head identity status separately from hairstyle status.
- Do NOT list wardrobe differences inside identityComparisonSummary when those differences are authorized by scene wardrobe text or by an outfit plate. Clothing mismatch belongs in matchesOutfit / issue, not in identity drift commentary.
- sameOverallDesignRead is true only when overall design read is unchanged.
- silhouetteDriftSeverity is one of none | mild | moderate | severe.
- Report observable checks only. No aggregate pass/fail field. Return JSON only.`,
  };
}

export function buildImageValidationRuntimePrompt(params: ImageValidationPromptParams): string {
  const { expectedCharacters } = params;
  const refs =
    params.referenceImages && params.referenceImages.length > 0 ? params.referenceImages : [];

  const characterList =
    expectedCharacters.length > 0
      ? expectedCharacters
          .map((c, i) => {
            const kind = promptKindLabel(c.characterKind);
            const subtype = c.speciesSubtype?.trim() ? ` | SUBTYPE=${c.speciesSubtype.trim()}` : '';
            const desc = c.description ? ` | ${c.description}` : '';
            const outfitLine = c.expectedOutfitForScene?.trim()
              ? ` | scene outfit: ${c.expectedOutfitForScene.trim()}`
              : '';
            return `${i + 1}. "${c.name}" | KIND=${kind}${subtype}${desc}${outfitLine}`;
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
              ref.referenceKind === 'outfit_plate'
                ? 'OUTFIT_PLATE'
                : ref.identitySource === 'turnaround'
                  ? 'IDENTITY_TURNAROUND'
                  : 'IDENTITY';
            return `"${ref.characterName}" -> Image ${imageIndex} [${kind}; ${role}]`;
          })
          .join('\n')
      : 'None';
  const layoutTemplateReferences = refs
    .map((ref, i) =>
      ref.referenceKind === 'layout_template'
        ? `Image ${i + 2}: exact page layout template. Use it to compare outer page aspect ratio, panel rectangles, frames, gutters, row/column splits, and leftover color guide residue.`
        : null
    )
    .filter((line): line is string => line != null);
  const layoutTemplateReferenceText =
    params.includeLayoutChecks && layoutTemplateReferences.length > 0
      ? `LAYOUT TEMPLATE REFERENCES:\n${layoutTemplateReferences.join('\n')}`
      : '';
  const includeBubbleChecks = params.includeBubbleChecks !== false;
  const layoutChecks = params.includeLayoutChecks
    ? [
        'GRAPHIC NOVEL LAYOUT CHECKS:',
        layoutTemplateReferences.length > 0
          ? '- Compare Image 1 against the listed layout template reference: same outer page shape, same panel rectangles, same black frame positions, same gutter positions, and same row/column splits.'
          : '',
        layoutTemplateReferences.length > 0
          ? '- Set hasExtraPanelStructure=true for any missing panel, extra panel, merged panel, split planned panel, fake divider, or scene boundary that does not exist in the layout template reference.'
          : '',
        layoutTemplateReferences.length > 0
          ? '- Set hasArtworkOutsidePanelBounds=true when final art occupies template gutters/margins or fails to stay inside the panel interiors shown by the layout template reference.'
          : '',
        includeBubbleChecks
          ? '- Inspect panel boxes, gutters, page margins, speech bubbles, thought bubbles, caption boxes, bubble tails, outlines, and printed bubble text.'
          : '- Inspect panel boxes, gutters, and page margins. This is an art-only page before server-rendered bubbles, so do not evaluate bubble overlap.',
        '- Set hasArtworkOutsidePanelBounds=true if any illustration artwork, character, prop, background, color, shadow, or texture spills outside its intended panel box into gutters, margins, or another panel.',
        includeBubbleChecks
          ? '- Set hasArtworkOverSpeechBubbles=true if any illustration artwork, character, prop, background, color, shadow, or texture overlaps, covers, touches in a confusing way, or reduces readability of any speech/thought/caption bubble, bubble tail, outline, or bubble text.'
          : '',
        '- Set hasExtraPanelStructure=true if the generated page visually contains extra panels or extra scenes beyond the planned template: fake gutters, extra black/white dividers, inset panels, split-screen cuts, or one planned panel split into multiple different locations, camera shots, or sequential story beats.',
        '- Set hasTemplateColorResidue=true if any color-coded guide-template fill is still visible in the artwork: sky-blue, peach, mint-green, lavender, butter-yellow, rose-pink, or similar flat template colors appearing as strips, blocks, bands, unpainted edges, or patches behind/around the illustration.',
        '- If the scene brief says "exactly N panel boxes", the generated page must visually read as exactly N panels. A planned panel may contain rich composition, but it must remain one continuous illustration and one story moment.',
        includeBubbleChecks
          ? '- Do not count the black panel frames, gutters, bubble outlines, bubble fills, bubble tails, or printed bubble text themselves as artwork.'
          : '- Do not count the black panel frames or gutters themselves as artwork.',
        includeBubbleChecks
          ? '- If all layout checks pass, set layoutFeedback to "ok". Otherwise describe the specific panel/bubble/extra-scene issue briefly.'
          : '- If all layout checks pass, set layoutFeedback to "ok". Otherwise describe the specific panel-boundary or extra-scene issue briefly.',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return [
    'Validate Image 1 against the expected character roster and return JSON only.',
    'For IDENTITY references: use them for identity and default clothing when no separate outfit ground truth exists.',
    'For IDENTITY_TURNAROUND references: treat the image as a strict multi-view model sheet. A generic substitute with different stable face/head/hair/proportions is not the named character.',
    'AUTHORITATIVE PRIORITY: if the designer scene brief describes a temporary scene-specific state, that brief overrides the neutral/default state shown in identity references.',
    `EXPECTED CHARACTERS (${expectedCharacters.length}):`,
    characterList,
    'CHARACTER KIND TABLE:',
    kindTable,
    params.sceneContext ? `AUTHORITATIVE DESIGNER SCENE BRIEF:\n${params.sceneContext}` : '',
    `IMAGE ORDER:\n${imageOrder}`,
    `VALIDATION MAPPING:\n${validationMapping}`,
    layoutTemplateReferenceText,
    layoutChecks,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildImageValidationPrompt(params: ImageValidationPromptParams): string {
  const cached = getImageValidationCachedPrefix((params.referenceImages?.length ?? 0) > 0);
  return `${cached.content}\n\n${buildImageValidationRuntimePrompt(params)}`;
}
