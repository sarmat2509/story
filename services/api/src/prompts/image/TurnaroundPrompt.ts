/**
 * Turnaround Sheet Prompt Builder
 * Generates a multi-view character turnaround model sheet
 * from a single reference drawing (child's artwork).
 *
 * Provider-agnostic: returns a plain string prompt.
 */

export interface TurnaroundPromptParams {
  characterName: string;
  characterDescription?: string; // AI-generated description from Gemini Vision analysis
}

/**
 * Build a prompt for generating a character turnaround model sheet.
 * The reference drawing is passed separately as an image to the provider.
 */
export function buildTurnaroundPrompt(params: TurnaroundPromptParams): string {
  const { characterName, characterDescription } = params;

  const lines: string[] = [
    `Create a character turnaround model sheet for the attached character drawing of "${characterName}".`,
    '',
    'Show the character in 4 poses on a CLEAN WHITE background, arranged left to right:',
    '1. FRONT view (facing the viewer)',
    '2. THREE-QUARTER view (turned ~45 degrees right)',
    '3. SIDE PROFILE view (facing right, 90 degrees)',
    '4. BACK view (facing away)',
    '',
    'CRITICAL RULES:',
    '- Preserve EXACTLY the silhouette, proportions, colors, patterns, and ALL design features from the reference drawing',
    '- All 4 views must clearly be the SAME character',
    '- Each view shows the FULL character (head to feet/base)',
    '- Clean white background with no additional elements',
    '- Equal spacing between views',
    '- Same scale for all views',
    '- Label each view below: "FRONT", "3/4", "SIDE", "BACK"',
    '- Style: 3D render with soft lighting, like a clay/Pixar-style figurine — keep all original colors and proportions from the reference',
    '- Do NOT add any new elements, accessories, or features not present in the reference',
    '- Do NOT change the character\'s shape, color scheme, or proportions',
  ];

  if (characterDescription) {
    lines.push(
      '',
      'CHARACTER DESCRIPTION (for additional context):',
      characterDescription,
    );
  }

  return lines.join('\n');
}

export interface TextOnlyTurnaroundParams {
  characterName: string;
  characterDescription: string;
  imageStyle?: string;
}

/**
 * Build a prompt for generating a character turnaround model sheet
 * from a TEXT DESCRIPTION ONLY (no reference image).
 * Used for LLM-invented characters.
 */
export function buildTextOnlyTurnaroundPrompt(params: TextOnlyTurnaroundParams): string {
  const { characterName, characterDescription, imageStyle } = params;

  const styleNote = imageStyle
    ? `Art style: ${imageStyle} — apply this style consistently across all 4 views.`
    : 'Style: 3D render with soft lighting, like a clay/Pixar-style figurine.';

  const lines: string[] = [
    `Create a character turnaround model sheet for a character called "${characterName}".`,
    '',
    'Show the character in 4 poses on a CLEAN WHITE background, arranged left to right:',
    '1. FRONT view (facing the viewer)',
    '2. THREE-QUARTER view (turned ~45 degrees right)',
    '3. SIDE PROFILE view (facing right, 90 degrees)',
    '4. BACK view (facing away)',
    '',
    'CHARACTER DESCRIPTION (create the character from this description):',
    characterDescription,
    '',
    'CRITICAL RULES:',
    '- Faithfully interpret every detail from the description above',
    '- All 4 views must clearly be the SAME character with consistent colors, proportions, and features',
    '- Each view shows the FULL character (head to feet/base)',
    '- Clean white background with no additional elements',
    '- Equal spacing between views',
    '- Same scale for all views',
    '- Label each view below: "FRONT", "3/4", "SIDE", "BACK"',
    `- ${styleNote}`,
    '- Do NOT add any elements or accessories not mentioned in the description',
  ];

  return lines.join('\n');
}
