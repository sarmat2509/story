/**
 * Image Validation Prompt Builder
 * Generates prompts for post-generation image validation using Gemini Vision.
 * Detects character hallucinations, duplicates, missing characters, description fidelity.
 *
 * Turnaround references are the ground truth for IDENTITY (face, hair when visible, body proportions,
 * creature signature markings, stable colors). Scene text is the ground truth for WARDROBE (matchesOutfit).
 */

import { stripCharacterIdFromName } from '@wondertales/shared';

export interface ImageValidationPromptParams {
  expectedCharacters: Array<{
    name: string;
    isImaginary: boolean;
    description?: string;
    expectedOutfitForScene?: string;
  }>;
  sceneContext?: string; // Setting + composition for occlusion awareness
  referenceImages?: Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
  }>;
}

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

/**
 * Build validation prompt for analyzing a generated illustration.
 *
 * Image 1 = generated illustration. Images 2, 3, ... = character reference images.
 * The prompt instructs the Vision model to compare each character against its reference.
 */
export function buildImageValidationPrompt(params: ImageValidationPromptParams): string {
  const { expectedCharacters } = params;

  const characterList = expectedCharacters
    .map((c, i) => {
      const kind = c.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN';
      const desc = c.description ? `: ${c.description}` : '';
      const outfitLine = c.expectedOutfitForScene?.trim()
        ? `\n   Expected outfit for THIS scene: ${c.expectedOutfitForScene.trim()}`
        : '';
      return `${i + 1}. "${c.name}" — KIND: ${kind} (${c.isImaginary ? 'apply creature identity rules; not a human child' : 'strict human identity rules apply'})${desc}${outfitLine}`;
    })
    .join('\n');

  const kindTable = expectedCharacters
    .map((c) => {
      const kind = c.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN';
      return `| "${c.name}" | ${kind} |`;
    })
    .join('\n');

  const sceneSection = params.sceneContext
    ? `\nSCENE CONTEXT: ${params.sceneContext}\n`
    : '';

  const refs = params.referenceImages && params.referenceImages.length > 0 ? params.referenceImages : [];
  const referenceSection = refs.length > 0
    ? `
IMAGE ORDER:
- Image 1: Generated illustration (validate this)
${refs.map((ref, i) => `- Image ${i + 2}: Reference for "${ref.characterName}"`).join('\n')}

VALIDATION MAPPING (use when checking each character — KIND must match the table below):
${refs
  .map((ref, i) => {
    const row = expectedRowForRefName(ref.characterName, expectedCharacters);
    const kind = row ? (row.isImaginary ? 'IMAGINARY_CREATURE' : 'HUMAN') : 'UNKNOWN';
    return `- "${ref.characterName}" → compare against Image ${i + 2} [KIND: ${kind}]`;
  })
  .join('\n')}
`
    : '';

  return `You are a quality assurance inspector for children's book illustrations.

CHARACTER KIND (critical): Each expected character is tagged HUMAN or IMAGINARY_CREATURE. Do not apply human hairstyle/child age-read rules to IMAGINARY_CREATURE rows. Do not treat a HUMAN as a generic creature archetype. Use the KIND on each EXPECTED CHARACTERS line and in VALIDATION MAPPING.

TASK: Analyze the generated illustration and validate it against the expected character list. When reference images exist, they are the ground truth for IDENTITY (face, visible hairstyle, proportions, species traits, stable skin/fur/markings)—the illustration should look like the same person or creature as the turnaround. For WARDROBE, the ground truth is ONLY the story text in SCENE CONTEXT: "CHARACTER OUTFITS" and each character's "Expected outfit for THIS scene" — that is what the generator was told to wear. Do not fail matchesOutfit because clothing differs from the turnaround sheet; DO fail matchesOutfit when visible garments do not match that scene wardrobe text (see 5c). Do not fail recognizableScore because clothing differs from the sheet—that is correct and expected.

GENERATED IMAGE (Image 1): The first attached image is the illustration to validate. Subsequent images are character turnaround references (identity). If generation used an outfit plate, treat CHARACTER OUTFITS / expected outfit text as primary for garments; the plate is a structural hint, not a substitute for scene text.
${referenceSection}EXPECTED CHARACTERS (${expectedCharacters.length} total):
${characterList}

CHARACTER KIND TABLE (same as above — use for JSON characterKind field):
| Name | KIND |
${kindTable}

${sceneSection}
STRICT IDENTITY VALIDATION (when a reference image exists):
Validate identity against the reference image, not against a broad archetype or “close enough” impression.

For HUMAN characters:
- Highest-weight identity features are: face structure, age read, visible hairstyle; then body proportions/silhouette; then stable colors/markings.
- Do not let matching clothes, palette, pose, art style, or “same type of child” compensate for wrong face, wrong age read, or wrong hairstyle.
- A clearly wrong face, age read, or visible hairstyle is a major identity failure, not a minor variation.
- If the reference reads as a young child, the generated figure must not read as older child, preteen, teen, or adult unless SCENE CONTEXT explicitly authorizes it.
- If hair is visible, compare length, cut, silhouette, parting, texture, braid/pony/bun/loose structure, and visible hair color pattern unless the scene explicitly authorizes a change.
- For HUMANS, a clearly wrong face OR age read OR hairstyle usually belongs around recognizableScore 0.7–0.8, not 0.9. If multiple high-weight human features drift together, recognizableScore is often 0.5 or lower.

STRICT GLOBAL DESIGN READ (all character kinds):
Do not validate only by matching local details such as spots, tail, wings, antennae, hair streaks, or accessories.
Also compare the overall design read of the figure:
- silhouette
- body type and mass distribution
- compact vs elongated read
- cute/round vs lanky/angular read
- head/face/muzzle shape
- first-glance character read

NO CHECKLIST COMPENSATION:
A character is not highly recognizable if small details match but the overall silhouette, body type, face/head shape, or first-glance design read differ noticeably.
Global design read matters more than partial feature matching.

For IMAGINARY_CREATURE characters:
- Identity includes overall silhouette, body type, compactness vs elongation, head/muzzle shape, limb-to-body ratios, tail integration, wing/antenna/horn/crest placement, and signature markings/colors.
- Compare creature subtype read, not only broad category. Example subtype shifts: spirit/firefly-like vs insect/fairy-like; plush round mascot vs reptilian/dinosaur-like; blob-like vs clearly jointed-limbed.
- If subtype read changes, recognizableScore must be below 1.0, usually around 0.6–0.8 for moderate subtype drift, or 0.5 or lower for strong drift.
- Major silhouette or body-type drift should usually set proportionsMatchReference to false and lower recognizableScore meaningfully even if colors and markings still partially match.

JSON OUTPUT RULES:
- characterKind must be exactly "human" or "imaginary" and must match the KIND table.
- faceMatchesReference, hairMatchesReference, ageReadMatchesReference, proportionsMatchReference are required booleans.
- identityComparisonSummary is required and must be contrastive, not vague. It must state:
  1) what matches,
  2) what differs,
  3) whether first-glance design read is unchanged or drifted.
  For IMAGINARY_CREATURE, always mention subtype read.
- sameOverallDesignRead (optional boolean): true only when silhouette, body type, subtype read, proportions, and first-glance design read all still match the reference. false if the figure reads like a design variant or reinterpretation.
- silhouetteDriftSeverity (optional: none, mild, moderate, severe): none only when silhouette/body type/subtype read are all closely aligned; moderate or severe when first-glance body read changes.

RECOGNIZABLE SCORE (recognizableScore 0-1):
Use the reference image as ground truth for IDENTITY only. Wardrobe is validated separately under matchesOutfit from scene text.

DIFFERENCE-FIRST CHECK:
Before assigning any high score, actively search for drift in:
- silhouette outline
- body type and mass distribution
- head-to-body ratio
- face/head/muzzle shape
- subtype read
- body-form reinterpretation
Do not assign 1.0 or 0.9 until you have checked these explicitly.

AUTHORIZED IDENTITY CHANGES:
If SCENE CONTEXT explicitly authorizes a different hair/face/age presentation, validate against that scene text instead of the turnaround for those authorized aspects only. Otherwise, the reference wins.

PROPORTIONS:
Compare relative body-part ratios, not absolute size. Check head-to-body ratio, limb length vs torso, neck length, and compact vs elongated silhouette. If ratios visibly drift and change the character read, lower recognizableScore accordingly.

OVERALL DESIGN READ:
If local features match but the figure reads overall like a different design variant, lower recognizableScore meaningfully. Do not treat this as a minor variation.

SILHOUETTE / SUBTYPE CAPS:
- Any noticeable subtype-read drift or body-form reinterpretation caps recognizableScore below 1.0.
- If proportionsMatchReference is false due to visible silhouette/body drift, recognizableScore should usually stay below 0.9 and often around 0.6–0.8.
- Never output 1.0 when first-glance design read, subtype read, or body archetype noticeably differ from the reference.

PERFECT SCORE GATE:
Use 1.0 only when there is no meaningful drift in:
- face/head/muzzle shape
- silhouette
- body type and mass distribution
- proportions
- subtype read (for creatures)
- signature identity traits
If there is any noticeable design reinterpretation, use below 1.0.

SCORING GUIDE:
- 1.0: no meaningful drift; same first-glance design read; same silhouette/body type/proportions/subtype.
- 0.9: one minor identity difference only; not a high-weight human failure, not body-type drift, not subtype drift, not major markings loss.
- 0.8: two meaningful differences, or mild but visible design drift.
- 0.6–0.7: noticeable silhouette/body-type/subtype drift, but still clearly the same named character.
- 0.5: major silhouette change, wrong species slot, or strong body-form reinterpretation.
- 0.3 or 0: barely or not recognizable as the same character.

CREATURE SIGNATURE MARKINGS:
For imaginary creatures, dominant body markings/patterns are primary identity. Missing or replaced dominant markings usually require recognizableScore 0.5 or lower.

COLORS (matchesColors):
Compare identity colors only: skin/fur/feathers, eyes, visible hair color, stable markings. Clothing color belongs to matchesOutfit, not matchesColors.

OUTFIT (matchesOutfit):
Use scene wardrobe text as the only garment ground truth:
1) CHARACTER OUTFITS
2) Expected outfit for THIS scene
3) remaining scene context / camera description
Do not use the turnaround as outfit ground truth when scene outfit text exists.
Validate garment type and structural details, not just color similarity.

IMPORTANT:
- Check all rules for every character independently.
- The issue field must include all observed problems, separated by semicolons.
- Apply SCENE-APPROPRIATE OCCLUSION and SCENE-APPROPRIATE CLOTHING logic before failing outfit checks.
- SERIES CONSISTENCY matters: do not accept alternate-looking design variants when the reference implies a stable repeating character design.
- FIRST-GLANCE RECOGNITION TEST: if a returning reader would hesitate to identify the character from silhouette, face/head shape, and body read, reduce recognizableScore.
- Report observable checks only: counts, per-character booleans and scores, global flags, and overallFeedback. Do not output an aggregate pass/fail field.

Return your analysis as JSON.`;
}
