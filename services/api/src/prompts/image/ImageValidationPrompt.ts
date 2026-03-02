/**
 * Image Validation Prompt Builder
 * Generates prompts for post-generation image validation using Gemini Vision.
 * Detects character hallucinations, duplicates, missing characters, description fidelity.
 *
 * Validation is reference-based: the model compares characters in the generated
 * illustration against reference images (turnaround sheets). References are always present.
 */

export interface ImageValidationPromptParams {
  expectedCharacters: Array<{
    name: string;
    isImaginary: boolean;
    description?: string;
  }>;
  sceneContext?: string; // Setting + composition for occlusion awareness
  referenceImages?: Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
  }>;
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
      const type = c.isImaginary ? 'imaginary creature' : 'real-world character';
      const desc = c.description ? `: ${c.description}` : '';
      return `${i + 1}. "${c.name}" — ${type}${desc}`;
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

VALIDATION MAPPING (use when checking each character):
${refs.map((ref, i) => `- "${ref.characterName}" → compare against Image ${i + 2}`).join('\n')}\n`
    : '';

  return `You are a quality assurance inspector for children's book illustrations.

TASK: Analyze the generated illustration and validate it against the expected character list. Compare each character against its reference image (see mapping below).

GENERATED IMAGE (Image 1): The first attached image is the illustration to validate. Subsequent images are character references.
${referenceSection}EXPECTED CHARACTERS (${expectedCharacters.length} total):
${characterList}
${sceneSection}VALIDATION RULES:
1. COUNT all distinct characters/creatures visible in the generated illustration. Include animals and imaginary creatures.
2. For EACH expected character, determine if it is present in the image. Match by the provided text description and visual features.
3. Check for DUPLICATES: Mark as duplicated ONLY when the same character appears twice (or more) WITHOUT scene justification. Do NOT mark as duplicated if the second appearance is clearly: mirror reflection, window/water reflection, portrait/photo on the wall, painting, or other scene-justified representation. Unjustified duplicates (AI hallucination) — mark duplicated: true.
4. Check for UNEXPECTED characters: Any character/creature in the image that does not match any expected character.
5. For EACH expected character, check APPEARANCE FIDELITY in 3 aspects (compare against the character's reference image — see mapping above):
   a) RECOGNIZABLE (recognizableScore 0-1): Compare the generated character against its reference image. Set recognizableScore using these EXACT rules:
   SCORE 1.0 — Use when: All distinctive features from reference are present and correct (antennae, horns, petal ears, flowers on wings, bioluminescent markings, unique tail, etc.). Silhouette, species/type, and colors match. Example: Reference shows butterfly with golden antennae and flowers on wings, generated has both → 1.0.
   SCORE 0.9 — Use when: Exactly ONE distinctive feature is wrong or missing; everything else matches. Examples: antennae not glowing golden (reference: glowing) → 0.9; flowers on wings missing (reference: has flowers) → 0.9; one accessory different (e.g. bow missing) → 0.9. Butterfly character antennae not glowing golden → 0.9. Dragonfly character flowers on wings missing → 0.9.
   SCORE 0.8 — Use when: Exactly TWO distinctive features wrong or missing. Example: antennae wrong AND flowers on wings missing → 0.8.
   SCORE 0.7 — Use when: Three or more distinctive features wrong/missing, but species and overall shape still correct. Creature is still clearly a butterfly/dragon/etc., but several details differ.
   SCORE 0.5 — Use when: Wrong main colors (e.g. blue creature drawn yellow/green). Wrong species type (e.g. bird drawn as mammal) but same general character slot. Major silhouette change (e.g. 4-legged drawn as 2-legged with wrong proportions).
   SCORE 0.3 — Use when: Barely the same character — wrong species AND wrong colors. Example: reference shows insect-like creature, generated shows furry mammal.
   SCORE 0 — Use when: Completely different creature — cat drawn as dog, bird drawn as fish, wrong character entirely. No one familiar with the reference would identify this as the same character.
   RULES: Count distinctive features from reference. 1 missing/wrong = 0.9, 2 = 0.8, 3+ = 0.7. Wrong species/colors = 0.5 or lower. Penalty formula: (1 - score) * 20. LIMB COUNTING: Count TOTAL limbs (arms + legs). 4-legged drawn as 2 arms + 2 legs = CORRECT. Ignore finger/toe counts. Distinctive features (eyes on stalks, horns, bioluminescent markings) ARE part of recognizability.
   b) COLORS (matchesColors): Does the color palette match the character's reference image? Check fur/skin/feather color, eye color, distinctive markings.
   c) OUTFIT (matchesOutfit): Do clothing and accessories match the character's reference image? Check hats, bows, dresses, shoes, scarves, jewelry. If no outfit is described for this character, set to true.
6. Check for TEXT: Look for any text, letters, words, numbers, signs, labels, or writing anywhere in the image.
7. Check for RENDERING ARTIFACTS: Look for visual glitches at character boundaries where characters overlap or stand near each other. Common artifacts: body parts (legs, arms, hands) of one character visible through another character's body, merged/fused limbs between characters, phantom extra limbs at overlap boundaries, transparency errors. These are AI compositing failures.

IMPORTANT:
- You MUST check ALL 7 rules for EVERY character independently. Do NOT stop after the first failure. A character can have multiple issues simultaneously (e.g., duplicated AND wrong colors). Report ALL of them.
- The "issue" field should list ALL problems for that character in one string, separated by semicolons (e.g., "wrong color — yellow instead of green; duplicated").
- Duplicates: only mark duplicated when NOT scene-justified (mirror, reflection, portrait = do NOT mark as duplicate).
- Background elements (trees, buildings, furniture) are NOT characters.
- Small animals/insects that are clearly part of the background are NOT characters unless they match an expected character.
- Toys, stuffed animals, figurines, dolls, statues, decorations, paintings, or any inanimate objects shaped like creatures are NOT characters — they are props/decor. Only count living/animate beings as characters.
- SCENE-APPROPRIATE OCCLUSION: If the scene context describes a situation where parts of a character's body or clothing would naturally be hidden (in bed, in water, behind furniture, seated at a table), do NOT penalize missing clothing or obscured body parts. Mark matchesOutfit as true if the visible outfit is consistent and the hidden parts are explained by the scene.
- SCENE-APPROPRIATE CLOTHING: Characters may not wear all described clothing items in every scene. A character described with a jacket who is in bed or swimming should NOT be penalized for lacking the jacket. Only penalize outfit mismatches for VISIBLE clothing that contradicts the reference.
- Rendering artifacts at character overlap points (e.g. one character's legs showing through another) make the image look broken and should be flagged.
- Set isValid to false if ANY of these are true: character count mismatch, any character duplicated, any expected character missing, unexpected characters present, text/letters found, rendering artifacts found, or any character has recognizableScore < 0.5, matchesColors: false, or matchesOutfit: false.

Return your analysis as JSON.`;
}
