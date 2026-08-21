import config from '../../config';

export const NO_TECHNICAL_REFERENCE_LABELS_RULE =
  'Visible story-world text, signs, lettering, numbers, captions, and speech bubbles are allowed. Never render technical reference identifiers or labels beginning with REF_, including REF_CH_, REF_ENV_, and REF_OBJ_, and never use those identifiers as character or scene captions.';

/** The config key keeps its legacy name; validation now checks only technical reference-label leaks. */
export function shouldCheckImageReferenceLabels(): boolean {
  return config.image.validationCheckTextOrSymbols;
}

export function optionalNoReferenceLabelsRule(): string {
  return shouldCheckImageReferenceLabels() ? NO_TECHNICAL_REFERENCE_LABELS_RULE : '';
}

/** @deprecated Use NO_TECHNICAL_REFERENCE_LABELS_RULE. */
export const NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE = NO_TECHNICAL_REFERENCE_LABELS_RULE;

/** @deprecated Use shouldCheckImageReferenceLabels. */
export const shouldCheckImageTextOrSymbols = shouldCheckImageReferenceLabels;

/** @deprecated Use optionalNoReferenceLabelsRule. */
export const optionalNoVisibleTextRule = optionalNoReferenceLabelsRule;

export function imageTextValidationPromptLines(
  briefLabel: string = 'scene brief'
): string[] {
  return [
    '- Ordinary visible story-world text is allowed. Signs, book or poster writing, letters, numbers, captions, speech bubbles, decorative lettering, watermarks, and UI-like text must NOT set hasTextOrLetters=true merely because text is visible.',
    '- hasTextOrLetters is a legacy field whose only active meaning is a leaked technical reference identifier. Set it true only when Image 1 visibly contains the literal REF_ prefix in a technical label, including REF_CH_, REF_ENV_, or REF_OBJ_. Do not infer a leak from garbled or unreadable ordinary writing.',
    '- Explicitly scan character captions, scene captions, bottom strips, plaques, filenames, and metadata blocks for REF_* leakage. Example: "REF_CH_EMILI_123" or "SECRET_CAVERN (REF_ENV)" sets hasTextOrLetters=true. The same caption or sign without a REF_* identifier is allowed and must leave the field false.',
    `- Text, glyphs, runes, sigils, and symbols required by or compatible with the ${briefLabel} are allowed visual content when they do not expose a technical REF_* identifier.`,
  ];
}
