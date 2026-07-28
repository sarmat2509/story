/**
 * Image Edit Prompt Builder
 * Generates prompts for editing/correcting generated images based on validation feedback.
 * Used when validation fails — sends the original image + edit instructions to fix issues
 * while preserving correct elements (composition, background, style).
 */

import type { ImageValidationResult } from '../../ai/types';
import {
  optionalNoVisibleTextRule,
  shouldCheckImageTextOrSymbols,
} from './ImageTextPolicy';

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
  | 'composition'
  | 'generic';

export interface ImageEditRepairIssue {
  kind: ImageEditRepairIssueKind;
  note: string;
}

export interface ImageEditSubjectReplacement {
  characterName?: string;
  referenceId?: string;
  actualVisibleDescription?: string | null;
  sceneSlotDescription?: string | null;
  validatorNote?: string | null;
  found?: boolean;
  repairKinds?: ImageEditRepairIssueKind[];
}

export interface ImageEditProtectedSubject {
  characterName?: string;
  referenceId: string;
}

export interface ImageEditRepairManifest {
  referenceMode: ImageEditRepairReferenceMode;
  issues: ImageEditRepairIssue[];
  subjectReplacements?: ImageEditSubjectReplacement[];
  protectedSubjects?: ImageEditProtectedSubject[];
}

export interface ImageEditPromptParams {
  validationResult: ImageValidationResult;
  sceneDescription?: string;
  /**
   * Structured, code-selected repair manifest. Preferred for validation edit repair:
   * the prompt template stays static, and only validator facts are inserted.
   */
  targetedRepairManifest?: ImageEditRepairManifest;
}

export function buildImageEditSystemInstruction(): string {
  return [
    "You edit children's book illustrations with precise, minimal changes.",
    'Follow the numbered edit instructions exactly.',
    'Use REF_* only to match attached reference images; never draw REF_* tokens.',
    optionalNoVisibleTextRule(),
    'Never create or duplicate architecture, openings, backgrounds, or celestial bodies merely to place a repaired subject; use the existing scene anchor when the instruction names one.',
    'Preserve composition, background, lighting, pose intent, style, and all unmentioned subjects.',
  ].filter(Boolean).join('\n');
}

function buildTargetedImageEditPrompt(manifest: ImageEditRepairManifest): string {
  const issues =
    manifest.issues.length > 0
      ? manifest.issues
      : [{ kind: 'generic' as const, note: 'Visual mismatch with the selected reference.' }];
  const replacementActions = Array.from(
    new Set(
      (manifest.subjectReplacements ?? [])
        .map(buildSubjectReplacementAction)
        .filter((action): action is string => !!action)
    )
  );
  const repairActions =
    replacementActions.length > 0
      ? [...replacementActions, ...buildNonSubjectEditActionsForIssues(issues)]
      : buildEditActionsForIssues(issues);
  const protectedSubjectAction = buildProtectedSubjectAction(manifest.protectedSubjects);
  const actions = [
    ...repairActions,
    ...(protectedSubjectAction ? [protectedSubjectAction] : []),
    'Preserve everything else in the image.',
    'Add no unrelated new props or extra subjects.',
  ]
    .map((action, index) => `${index + 1}. ${action}`)
    .join('\n');
  const notes =
    replacementActions.length > 0
      ? ''
      : `\n\nValidator notes:\n${issues.map((issue) => `- ${issue.kind}: ${issue.note}`).join('\n')}`;

  return `Make these edits:
${actions}${notes}`;
}

function buildProtectedSubjectAction(
  protectedSubjects: ImageEditProtectedSubject[] | undefined
): string | null {
  const referenceIds = [
    ...new Set(
      (protectedSubjects ?? []).map((subject) => subject.referenceId.trim()).filter(Boolean)
    ),
  ];
  if (referenceIds.length === 0) return null;
  return `Keep the expected characters matching ${referenceIds.join(', ')} unchanged; do not remove, replace, or redraw them.`;
}

function buildSubjectReplacementAction(replacement: ImageEditSubjectReplacement): string | null {
  const reference = replacement.referenceId?.trim()
    ? replacement.referenceId.trim()
    : 'the matching attached reference image';
  const visible = visibleSubjectDescription(replacement.actualVisibleDescription);
  const sceneSlot = compactPromptText(replacement.sceneSlotDescription);

  if (replacement.found === false && !visible) {
    if (sceneSlot && /\bwindow\b/i.test(sceneSlot)) {
      return `Place the full character from ${reference} inside the one existing visible window view described as "${sceneSlot}". Do not create, duplicate, or redraw a window, opening, portal, mirror, frame, sky view, or celestial body.`;
    }
    return sceneSlot
      ? `Add the full character from ${reference} to this scene slot: "${sceneSlot}".`
      : `Add the full character from ${reference} to the expected scene slot.`;
  }

  if (visible) {
    return `Completely replace the visible subject described as "${visible}" with the full character from ${reference}.`;
  }
  if (sceneSlot) {
    return `Completely replace the visible subject occupying this scene slot: "${sceneSlot}" with the full character from ${reference}.`;
  }

  return `Completely replace the mismatched visible subject for the expected character slot with the full character from ${reference}.`;
}

function compactPromptText(text: string | null | undefined): string | null {
  const cleaned = text?.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.replace(/"/g, "'");
}

function visibleSubjectDescription(text: string | null | undefined): string | null {
  const cleaned = compactPromptText(text);
  if (!cleaned) return null;
  return looksLikeValidationProblem(cleaned) ? null : cleaned;
}

function looksLikeValidationProblem(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /^(missing|lacks?|does not|doesn't|not enough|incorrect|wrong|should|needs?|must)\b/.test(lower)
  ) {
    return true;
  }
  return /\b(missing|mismatch|does not match|doesn't match|differs from|should be|needs to|validator|reference|signature|not visible|not present)\b/.test(
    lower
  );
}

function buildEditActionsForIssues(issues: ImageEditRepairIssue[]): string[] {
  const identityKinds = new Set<ImageEditRepairIssueKind>();
  const actions: string[] = [];

  for (const issue of issues) {
    if (isTraitRepairKind(issue.kind)) {
      identityKinds.add(issue.kind);
      continue;
    }
    const action = editActionForIssue(issue);
    if (!actions.includes(action)) {
      actions.push(action);
    }
  }

  const traitAction = buildCombinedTraitAction(identityKinds);
  return traitAction ? [traitAction, ...actions] : actions;
}

function buildNonSubjectEditActionsForIssues(issues: ImageEditRepairIssue[]): string[] {
  const actions: string[] = [];
  for (const issue of issues) {
    if (isTraitRepairKind(issue.kind) || issue.kind === 'presence') {
      continue;
    }
    const action = editActionForIssue(issue);
    if (!actions.includes(action)) {
      actions.push(action);
    }
  }
  return actions;
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

  return 'Replace the validator-flagged mismatched visible subject with the matching attached reference image.';
}

function editActionForIssue(issue: ImageEditRepairIssue): string {
  switch (issue.kind) {
    case 'presence':
      return 'Add only the missing expected subject from the selected visual reference.';
    case 'duplicate':
      return 'Remove only the duplicate copy of the same subject.';
    case 'unexpected': {
      const visible = visibleSubjectDescription(issue.note);
      return visible
        ? `Remove only the unexpected extra subject described as "${visible}".`
        : 'Remove only the unexpected extra subject.';
    }
    case 'text':
      return 'Remove only the visible text or lettering, including any leaked reference-sheet title, label, or REF_* identifier.';
    case 'composition':
      return `Restore this exact scene structure: "${compactPromptText(issue.note) || 'use the scene brief'}". Count every separate framed, curtained, or bordered night-sky opening as a window, even if it has a different size or shape. If there are two, retain only the original environment-reference window; completely remove the added opening itself (not just its Moon) and fill that area with the continuous surrounding wall/background. Remove duplicate or extra windows, doors, portals, mirrors, framed openings, sky views, and celestial bodies; retain only the explicitly requested anchors.`;
    case 'generic':
    default:
      return 'Change only the validator-reported visual mismatch using the selected reference.';
  }
}

/**
 * Build edit instructions from validation feedback.
 * The resulting prompt is sent alongside the original image to get a corrected version.
 */
export function buildImageEditPrompt(params: ImageEditPromptParams): string {
  const { validationResult, sceneDescription, targetedRepairManifest } = params;
  if (targetedRepairManifest) {
    return buildTargetedImageEditPrompt(targetedRepairManifest);
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
        `- Character "${character.name}" has WRONG CLOTHING/ACCESSORIES compared with the visual character reference. Replace the whole visible character with the matching labeled reference instead of using wardrobe text.`
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
          ? `- Character "${character.name}" (HUMAN): Face, head structure, and stable identifying traits do not match the turnaround reference. Align eyes, nose, mouth, cheeks, chin, and distinguishing marks with the reference; avoid a vague lookalike.`
          : `- Character "${character.name}" (${kindLabel}): Muzzle/face, eyes, and expression do not match the creature reference (mane/fur/head markings as applicable).`
      );
    }
    if (character.hairMatchesReference === false) {
      issues.push(
        human
          ? `- Character "${character.name}" (HUMAN): Visible hairstyle/hair does not match the identity reference. Restore the exact hairstyle structure from the identity reference, not an invented nearby version: hairline/parting, bangs/front locks, number and placement of braids/ponytails/buns, braid thickness, loose-vs-tied sections, length, side placement, and distinctive colored streak placement must match. Use the reference hairstyle instead of the failed image's wrong simplified hairstyle. Keep the hair faithful; avoid redesigning, re-braiding, re-styling, simplifying, or beautifying it. Wardrobe or palette must not substitute for correct hair.`
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
  if (shouldCheckImageTextOrSymbols() && validationResult.hasTextOrLetters) {
    issues.push(
      '- The image contains TEXT, LETTERS, or WRITING. Remove all text and lettering from the illustration.'
    );
  }

  // Build the expected character summary for context
  const expectedSummary = validationResult.characters.map((c) => c.name).join(', ');
  const referenceInstructions = `- Use labeled character references as the source for requested character replacements.
- For a wrong visible character, replace the whole visible character with the matching labeled reference.`;

  let prompt = `This children's book illustration has quality issues that need to be corrected.

CRITICAL INSTRUCTIONS:
- Attached images before the failed illustration are visual references. The final attached image is the failed scene illustration to repair.
${referenceInstructions}
- The failed scene illustration preserves composition and correct background elements, but it is NOT source of truth for any character trait listed as wrong below. Replace incorrect characters from the labeled visual references.
- Use labeled visual references for full-character identity, object, and environment grounding as labeled.
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
