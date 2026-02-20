/**
 * Image Validation Prompt Builder
 * Generates prompts for post-generation image validation using Gemini Vision.
 * Detects character hallucinations, duplicates, missing characters, description fidelity.
 *
 * Validation is text-description-based: the model compares characters in the
 * generated illustration against textual descriptions (no reference images needed).
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
    imageData: string; // base64
    mimeType: string;
  }>;
}

/**
 * Build validation prompt for analyzing a generated illustration.
 *
 * Only ONE image is passed: the generated illustration.
 * Character matching is done via text descriptions, not reference drawings.
 *
 * The prompt instructs the Vision model to:
 * - Count characters in the generated image
 * - Check each expected character is present (not missing)
 * - Detect duplicate/cloned characters
 * - Compare characters against their text descriptions
 * - Check for unwanted text or letters
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

  const referenceSection = params.referenceImages && params.referenceImages.length > 0
    ? `\nCHARACTER REFERENCE IMAGES:\nThe following reference images show the EXPECTED appearance of key characters. Compare the characters in the generated image against these references for visual similarity (face, hair, body shape, colors, proportions). The generated image is Image 1; reference images follow.\n${params.referenceImages.map((ref, i) => `- Image ${i + 2}: Reference for "${ref.characterName}"`).join('\n')}\n`
    : '';

  return `You are a quality assurance inspector for children's book illustrations.

TASK: Analyze the generated illustration and validate it against the expected character list.${referenceSection ? ' Use the provided reference images to verify visual similarity for key characters.' : ''}

GENERATED IMAGE (Image 1): The first attached image is the illustration to validate.${referenceSection ? ' Subsequent images are character references.' : ''}

EXPECTED CHARACTERS (${expectedCharacters.length} total):
${characterList}
${sceneSection}${referenceSection}
VALIDATION RULES:
1. COUNT all distinct characters/creatures visible in the generated illustration. Include animals and imaginary creatures.
2. For EACH expected character, determine if it is present in the image. Match by the provided text description and visual features.
3. Check for DUPLICATES: If the same character appears more than once (two similar-looking versions of the same character, possibly with slight differences), mark it as duplicated. This is a common AI hallucination.
4. Check for UNEXPECTED characters: Any character/creature in the image that does not match any expected character.
5. For EACH expected character, check APPEARANCE FIDELITY in 3 aspects:
   a) RECOGNIZABLE: Would someone who knows this character's description recognize it in the image? Consider the overall silhouette, species/type, colors, and design together. LIMB COUNTING: AI illustration anthropomorphizes creatures. When verifying limbs, count the TOTAL number of limbs (arms + legs combined). A creature described with "four legs" drawn with "two arms + two legs" has 4 total limbs — this is CORRECT. Only flag if the total limb count differs significantly. Finger/toe counts may also differ — ignore them. However, DISTINCTIVE anatomical features (eyes on stalks, crest/ridge on head, horns, bioluminescent markings, unique tail shape) ARE part of recognizability and must be checked. Examples: cat drawn as dog = false. Blue creature drawn yellow = false. 4-legged creature with 2 arms + 2 legs but same shape/colors = true. "Eyes on stalks" drawn with normal eyes = false.
   b) COLORS (matchesColors): Does the color palette match the description? Check fur/skin/feather color, eye color, distinctive markings and coloring.
   c) OUTFIT (matchesOutfit): Do clothing and accessories match the description? Check hats, bows, dresses, shoes, scarves, jewelry. If no outfit is described for this character, set to true.
6. Check for TEXT: Look for any text, letters, words, numbers, signs, labels, or writing anywhere in the image.
7. Check for RENDERING ARTIFACTS: Look for visual glitches at character boundaries where characters overlap or stand near each other. Common artifacts: body parts (legs, arms, hands) of one character visible through another character's body, merged/fused limbs between characters, phantom extra limbs at overlap boundaries, transparency errors. These are AI compositing failures.

IMPORTANT:
- You MUST check ALL 7 rules for EVERY character independently. Do NOT stop after the first failure. A character can have multiple issues simultaneously (e.g., duplicated AND wrong colors). Report ALL of them.
- The "issue" field should list ALL problems for that character in one string, separated by semicolons (e.g., "wrong color — yellow instead of green; duplicated").
- Be strict about duplicates — two similar characters that look like variations of the same design count as duplicates.
- Background elements (trees, buildings, furniture) are NOT characters.
- Small animals/insects that are clearly part of the background are NOT characters unless they match an expected character.
- Toys, stuffed animals, figurines, dolls, statues, decorations, paintings, or any inanimate objects shaped like creatures are NOT characters — they are props/decor. Only count living/animate beings as characters.
- SCENE-APPROPRIATE OCCLUSION: If the scene context describes a situation where parts of a character's body or clothing would naturally be hidden (in bed, in water, behind furniture, seated at a table), do NOT penalize missing clothing or obscured body parts. Mark matchesOutfit as true if the visible outfit is consistent and the hidden parts are explained by the scene.
- SCENE-APPROPRIATE CLOTHING: Characters may not wear all described clothing items in every scene. A character described with a jacket who is in bed or swimming should NOT be penalized for lacking the jacket. Only penalize outfit mismatches for VISIBLE clothing that contradicts the description.
- Rendering artifacts at character overlap points (e.g. one character's legs showing through another) make the image look broken and should be flagged.
- Set isValid to false if ANY of these are true: character count mismatch, any character duplicated, any expected character missing, unexpected characters present, text/letters found, rendering artifacts found, or any character has recognizable: false.

Return your analysis as JSON.`;
}
