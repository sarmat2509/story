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
      issues.push(
        `- Character "${character.name}" is MISSING from the illustration. Add this character to the scene.`
      );
    }
    if (character.duplicated) {
      issues.push(
        `- Character "${character.name}" appears MORE THAN ONCE (duplicated). Keep only one instance and remove the duplicate.`
      );
    }
    if (!character.matchesColors) {
      issues.push(
        `- Character "${character.name}" has WRONG COLORS. Fix the color palette to match the description.`
      );
    }
    if (!character.matchesOutfit) {
      issues.push(
        `- Character "${character.name}" has WRONG OUTFIT/ACCESSORIES. Match the scene CHARACTER OUTFITS / expected wardrobe text exactly: same garment type, sleeve/collar/length, shoes, and accessories — not just similar colors.`
      );
    }
    const human = character.characterKind === 'human';
    const kindLabel = human
      ? 'HUMAN'
      : character.characterKind === 'animal'
        ? 'ANIMAL'
        : 'IMAGINARY';
    if (character.faceMatchesReference === false) {
      issues.push(
        human
          ? `- Character "${character.name}" (HUMAN): Face, head structure, and stable identifying traits do not match the turnaround reference. Align eyes, nose, mouth, cheeks, chin, and distinguishing marks with the reference — do not settle for a vague lookalike.`
          : `- Character "${character.name}" (${kindLabel}): Muzzle/face, eyes, and expression do not match the creature reference (mane/fur/head markings as applicable).`
      );
    }
    if (character.hairMatchesReference === false) {
      issues.push(
        human
          ? `- Character "${character.name}" (HUMAN): Visible hairstyle/hair does not match the reference (length, part, texture, color). Wardrobe or palette must not substitute for correct hair.`
          : `- Character "${character.name}" (${kindLabel}): Head fur/mane/crown markings do not match the reference sheet.`
      );
    }
    if (character.ageReadMatchesReference === false) {
      issues.push(
        human
          ? `- Character "${character.name}" (HUMAN): Apparent age category (child vs teen/adult) does not match the reference and scene — correct body scale and facial maturity.`
          : `- Character "${character.name}" (${kindLabel}): Apparent life stage or scale relative to the reference does not match (unless the scene clearly requires a deliberate change).`
      );
    }
    if (character.proportionsMatchReference === false) {
      issues.push(
        `- Character "${character.name}": Head-to-body and limb proportions / silhouette do not match the reference; fix anatomy scale while keeping the same pose intent.`
      );
    }
    if (!human && character.sameOverallDesignRead === false) {
      issues.push(
        `- Character "${character.name}" (${kindLabel}): Overall design read / body type does not match the reference. Restore the correct species/body form and signature markings.`
      );
    }
    if (
      !human &&
      character.silhouetteDriftSeverity &&
      character.silhouetteDriftSeverity !== 'none'
    ) {
      issues.push(
        `- Character "${character.name}" (${kindLabel}): Silhouette drift (${character.silhouetteDriftSeverity}) — realign the creature body proportions with the reference.`
      );
    }
    // Include general issue field if present (may contain additional details not covered above)
    if (character.issue) {
      issues.push(`- Character "${character.name}" additional details: ${character.issue}`);
    }
  }

  // Top-level issues
  if (validationResult.hasUnexpectedCharacters) {
    issues.push(
      '- There are UNEXPECTED characters in the image that should not be there. Remove any characters not in the expected list.'
    );
  }
  if (validationResult.hasTextOrLetters) {
    issues.push(
      '- The image contains TEXT, LETTERS, or WRITING. Remove all text and lettering from the illustration.'
    );
  }

  // Build the expected character summary for context
  const expectedSummary = validationResult.characters.map((c) => c.name).join(', ');

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
