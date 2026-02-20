/**
 * Image Edit Prompt Builder
 * Generates prompts for editing/correcting generated images based on validation feedback.
 * Used when validation fails — sends the original image + edit instructions to fix issues
 * while preserving correct elements (composition, background, style).
 */

import type { ImageValidationResult } from '../../ai/types';

export interface ImageEditPromptParams {
  validationResult: ImageValidationResult;
  sceneDescription?: string;
}

/**
 * Build edit instructions from validation feedback.
 * The resulting prompt is sent alongside the original image to get a corrected version.
 */
export function buildImageEditPrompt(params: ImageEditPromptParams): string {
  const { validationResult, sceneDescription } = params;
  const issues: string[] = [];

  // Collect per-character issues — report ALL issues, not just the first
  for (const character of validationResult.characters) {
    if (!character.found) {
      issues.push(`- Character "${character.name}" is MISSING from the illustration. Add this character to the scene.`);
    }
    if (character.duplicated) {
      issues.push(`- Character "${character.name}" appears MORE THAN ONCE (duplicated). Keep only one instance and remove the duplicate.`);
    }
    if (!character.matchesColors) {
      issues.push(`- Character "${character.name}" has WRONG COLORS. Fix the color palette to match the description.`);
    }
    if (!character.matchesOutfit) {
      issues.push(`- Character "${character.name}" has WRONG OUTFIT/ACCESSORIES. Fix clothing and accessories to match the description.`);
    }
    // Include general issue field if present (may contain additional details not covered above)
    if (character.issue) {
      issues.push(`- Character "${character.name}" additional details: ${character.issue}`);
    }
  }

  // Top-level issues
  if (validationResult.hasUnexpectedCharacters) {
    issues.push('- There are UNEXPECTED characters in the image that should not be there. Remove any characters not in the expected list.');
  }
  if (validationResult.hasTextOrLetters) {
    issues.push('- The image contains TEXT, LETTERS, or WRITING. Remove all text and lettering from the illustration.');
  }

  // Build the expected character summary for context
  const expectedSummary = validationResult.characters
    .map(c => c.name)
    .join(', ');

  let prompt = `This children's book illustration has quality issues that need to be corrected.

CRITICAL INSTRUCTIONS:
- PRESERVE the overall composition, background, art style, color palette, and all correctly depicted elements.
- ONLY fix the specific problems listed below.
- Do NOT change the scene layout, camera angle, or lighting.
- The corrected image must look like a refined version of the same illustration, not a completely different image.

ISSUES TO FIX:
${issues.join('\n')}

EXPECTED CHARACTERS IN THIS SCENE: ${expectedSummary}`;

  if (sceneDescription) {
    prompt += `\n\nSCENE CONTEXT: ${sceneDescription}`;
  }

  prompt += '\n\nGenerate the corrected illustration.';

  return prompt;
}
