/**
 * Image Edit Prompt Builder
 * Generates prompts for editing/correcting generated images based on validation feedback.
 * Used when validation fails — sends the original image + edit instructions to fix issues
 * while preserving correct elements (composition, background, style).
 */

import type { ImageValidationResult } from '../../ai/types';

export type ImageEditRepairReferenceMode = 'identity' | 'outfit' | 'identity_and_outfit' | 'none';
export type ImageEditRepairIssueKind =
  | 'presence'
  | 'duplicate'
  | 'head'
  | 'face'
  | 'hair'
  | 'age'
  | 'body'
  | 'design'
  | 'silhouette'
  | 'colors'
  | 'outfit'
  | 'unexpected'
  | 'text'
  | 'generic';

export interface ImageEditRepairIssue {
  kind: ImageEditRepairIssueKind;
  note: string;
}

export interface ImageEditRepairManifest {
  referenceMode: ImageEditRepairReferenceMode;
  issues: ImageEditRepairIssue[];
}

export interface ImageEditPromptParams {
  validationResult: ImageValidationResult;
  sceneDescription?: string;
  /**
   * Structured, code-selected repair manifest. Preferred for validation edit repair:
   * the prompt template stays static, and only validator facts are inserted.
   */
  targetedRepairManifest?: ImageEditRepairManifest;
  /** Deprecated fallback for older callers. Prefer targetedRepairManifest. */
  targetedRepairInstruction?: string;
}

export function buildImageEditSystemInstruction(): string {
  return [
    'You are a precise image-editing model for children\'s book illustrations.',
    'Perform a surgical edit of the failed scene illustration.',
    'Use attached reference images only according to their labels.',
    'Preserve composition, background, lighting, pose intent, art style, and every element not listed in the validator issues.',
    'Do not infer extra reference roles. Change only traits listed in the validator issues.',
  ].join('\n');
}

function buildTargetedImageEditPrompt(manifest: ImageEditRepairManifest): string {
  const issues = manifest.issues.length > 0
    ? manifest.issues
    : [{ kind: 'generic' as const, note: 'Visual mismatch with the selected reference.' }];
  const actions = buildEditActionsForIssues(issues).map((action) => `- ${action}`).join('\n');
  const notes = issues.map((issue) => `- ${issue.kind}: ${issue.note}`).join('\n');

  return `Using the failed illustration as the base image, make only these edits:
${actions}

Validator notes:
${notes}

Keep everything else exactly the same.
Do not add labels, captions, or any text.

Generate the corrected illustration.`;
}

function buildEditActionsForIssues(issues: ImageEditRepairIssue[]): string[] {
  const identityKinds = new Set<ImageEditRepairIssueKind>();
  const actions: string[] = [];

  for (const issue of issues) {
    if (isTraitRepairKind(issue.kind)) {
      identityKinds.add(issue.kind);
      continue;
    }
    const action = editActionForIssue(issue.kind);
    if (!actions.includes(action)) {
      actions.push(action);
    }
  }

  const traitAction = buildCombinedTraitAction(identityKinds);
  return traitAction ? [traitAction, ...actions] : actions;
}

function isTraitRepairKind(kind: ImageEditRepairIssueKind): boolean {
  return (
    kind === 'face' ||
    kind === 'hair' ||
    kind === 'head' ||
    kind === 'age' ||
    kind === 'body' ||
    kind === 'design' ||
    kind === 'silhouette' ||
    kind === 'colors' ||
    kind === 'outfit'
  );
}

function buildCombinedTraitAction(kinds: Set<ImageEditRepairIssueKind>): string | null {
  if (kinds.size === 0) {
    return null;
  }

  const changeTraits: string[] = [];
  if (kinds.has('head')) {
    changeTraits.push('head-and-hair identity');
  } else if (kinds.has('face')) {
    changeTraits.push('face/head identity');
  }
  if (!kinds.has('head') && kinds.has('hair')) {
    changeTraits.push('hairstyle');
  }
  if (kinds.has('age')) {
    changeTraits.push('age read');
  }
  if (kinds.has('body') || kinds.has('design') || kinds.has('silhouette')) {
    changeTraits.push('body proportions and silhouette');
  }
  if (kinds.has('colors')) {
    changeTraits.push('stable identity colors');
  }
  if (kinds.has('outfit')) {
    changeTraits.push('clothing/accessories');
  }

  const preserveTraits: string[] = [];
  if (!kinds.has('head') && !kinds.has('face')) {
    preserveTraits.push('face/head identity');
  }
  if (!kinds.has('head') && !kinds.has('hair')) {
    preserveTraits.push('hairstyle');
  }
  if (!kinds.has('outfit')) {
    preserveTraits.push('clothing/accessories');
  }
  if (!kinds.has('body') && !kinds.has('design') && !kinds.has('silhouette')) {
    preserveTraits.push('body proportions and silhouette');
  }
  if (!kinds.has('head') && !kinds.has('age')) {
    preserveTraits.push('age read');
  }
  if (!kinds.has('head') && !kinds.has('colors')) {
    preserveTraits.push('stable identity colors');
  }

  const sourceParts: string[] = [];
  if ([...kinds].some((kind) => kind !== 'outfit')) {
    sourceParts.push('the PERSON SOURCE for identity traits');
  }
  if (kinds.has('outfit')) {
    sourceParts.push('the CLOTHES SOURCE for clothing/accessories');
  }

  return [
    `Change only the ${formatList(changeTraits)} of the matching visible subject to match ${formatList(sourceParts)}.`,
    ...buildTraitSpecificRequirements(kinds),
    `Keep ${formatList([...preserveTraits, 'pose', 'style', 'lighting', 'composition', 'background'])} exactly the same.`,
  ].join(' ');
}

function buildTraitSpecificRequirements(kinds: Set<ImageEditRepairIssueKind>): string[] {
  const requirements: string[] = [];
  if (kinds.has('head')) {
    requirements.push(
      'For head-and-hair identity, replace the entire visible head area from the PERSON SOURCE as one unit: head shape, face identity, ears, hairline, complete hairstyle, and hair color zoning. Keep the scene expression, gaze direction, and head angle from the failed illustration as much as possible without changing the source identity. Do not copy clothing, body, pose, or background from the PERSON SOURCE.'
    );
  }
  if (kinds.has('hair')) {
    requirements.push(
      'For hairstyle, replace the current hair area with the exact complete hairstyle from the PERSON SOURCE; copy the whole hair arrangement and hair color zoning: which regions use natural/base color, which regions use dyed/accent colors, and how those colors are distributed across braids, ponytails, buns, bangs/front strands, roots, and loose sections. Do not spread accent colors into natural/base regions, lose accent colors in dyed regions, approximate, simplify, or invent a new hairstyle.'
    );
  }
  if (kinds.has('face')) {
    requirements.push(
      'For face/head identity, copy the face and head design from the PERSON SOURCE as one whole identity. Do not rebuild it from separate facial features.'
    );
  }
  if (kinds.has('outfit')) {
    requirements.push(
      'For clothing/accessories, use only the wardrobe from the CLOTHES SOURCE. Do not copy face, hair, body, pose, or mannequin shape from the clothing reference.'
    );
  }
  return requirements;
}

function formatList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] || '';
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function editActionForIssue(kind: ImageEditRepairIssueKind): string {
  switch (kind) {
    case 'presence':
      return 'Add only the missing expected subject from the selected visual reference, matching the existing style, lighting, and perspective. Keep the existing scene unchanged.';
    case 'duplicate':
      return 'Remove only the duplicate copy of the same subject. Keep one correct instance and preserve the rest of the image exactly.';
    case 'unexpected':
      return 'Remove only the unexpected extra subject. Preserve the intended subjects and the rest of the image exactly.';
    case 'text':
      return 'Remove only the visible text or lettering. Preserve the rest of the image exactly.';
    case 'generic':
    default:
      return 'Change only the validator-reported visual mismatch using the selected reference. Preserve the rest of the image exactly.';
  }
}

/**
 * Build edit instructions from validation feedback.
 * The resulting prompt is sent alongside the original image to get a corrected version.
 */
export function buildImageEditPrompt(params: ImageEditPromptParams): string {
  const { validationResult, sceneDescription, targetedRepairInstruction, targetedRepairManifest } = params;
  if (targetedRepairManifest) {
    return buildTargetedImageEditPrompt(targetedRepairManifest);
  }
  if (targetedRepairInstruction) {
    return buildTargetedImageEditPrompt({
      referenceMode: 'none',
      issues: [{ kind: 'generic', note: targetedRepairInstruction }],
    });
  }

  const issues: string[] = [];
  const characterVerdicts = validationResult.characters.map((character) => ({
    name: character.name,
    kind: character.characterKind,
    found: character.found,
    duplicated: character.duplicated,
    recognizableScore: character.recognizableScore,
    matchesColors: character.matchesColors,
    matchesOutfit: character.matchesOutfit,
    faceMatchesReference: character.faceMatchesReference,
    hairMatchesReference: character.hairMatchesReference,
    ageReadMatchesReference: character.ageReadMatchesReference,
    proportionsMatchReference: character.proportionsMatchReference,
    sameOverallDesignRead: character.sameOverallDesignRead,
    silhouetteDriftSeverity: character.silhouetteDriftSeverity,
    issue: character.issue,
    identityComparisonSummary: character.identityComparisonSummary,
  }));

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
        `- Character "${character.name}" has WRONG OUTFIT/ACCESSORIES. Change only clothing/accessories. Match the scene CHARACTER OUTFITS / expected wardrobe text exactly: same garment type, sleeve/collar/length, shoes, and accessories — not just similar colors. Do not alter this character's face, hairstyle, age read, body identity, or silhouette while changing wardrobe.`
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
          ? `- Character "${character.name}" (HUMAN): Visible hairstyle/hair does not match the identity reference. Restore the exact hairstyle structure from the identity reference, not an invented nearby version: hairline/parting, bangs/front locks, number and placement of braids/ponytails/buns, braid thickness, loose-vs-tied sections, length, side placement, and distinctive colored streak placement must match. Do not preserve the failed image's wrong simplified hairstyle. Do not redesign, re-braid, re-style, simplify, or beautify the hair. Wardrobe or palette must not substitute for correct hair.`
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
  const referenceInstructions = targetedRepairInstruction
    ? `- ${targetedRepairInstruction}`
    : `- Read each reference label before using the image. Follow the declarative source roles exactly: PERSON SOURCE images define the person; CLOTHES SOURCE images define clothing/accessories only.
- If a character has both a PERSON SOURCE and a CLOTHES SOURCE, draw the person from the PERSON SOURCE wearing the clothing/accessories from the CLOTHES SOURCE. Do not visually merge them into a new character design.
- PERSON SOURCE controls the exact locked identity: face, hairstyle structure, hair placement, age read, body proportions, silhouette, skin/hair palette, and stable marks.
- CLOTHES SOURCE controls clothing/accessories only.
- Outfit plates are mannequin/wardrobe references only. They must not define or override face, hair, age, body identity, or character likeness.
- Applying an outfit plate means changing clothes on the exact same character. Only clothing/accessories should change. Do not redesign, re-braid, re-style, simplify, or otherwise alter the character's face, hair, age read, body identity, or silhouette because of an outfit plate.`;

  let prompt = `This children's book illustration has quality issues that need to be corrected.

CRITICAL INSTRUCTIONS:
- Attached images before the failed illustration are visual references. The final attached image is the failed scene illustration to repair.
${referenceInstructions}
- The failed scene illustration preserves composition and correct background elements, but it is NOT source of truth for any character trait listed as wrong below. Replace incorrect face, hair, body identity, or wardrobe details from the labeled references.
- Use visual references only for identity, outfit/wardrobe, object, and environment grounding as labeled.
- PRESERVE the overall composition, background, art style, color palette, and all correctly depicted elements.
- ONLY fix the specific problems listed below.
- Do NOT change the scene layout, camera angle, or lighting.
- The corrected image must look like a refined version of the same illustration, not a completely different image.

ISSUES TO FIX:
${issues.join('\n')}

VALIDATOR VERDICT:
${validationResult.overallFeedback || 'No overall feedback.'}

PER-CHARACTER VALIDATOR OUTPUT:
${JSON.stringify(characterVerdicts, null, 2)}

EXPECTED CHARACTERS IN THIS SCENE: ${expectedSummary}`;

  if (sceneDescription) {
    prompt += `\n\nSCENE CONTEXT: ${sceneDescription}`;
  }

  prompt += '\n\nGenerate the corrected illustration.';

  return prompt;
}
