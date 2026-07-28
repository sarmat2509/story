import config from '../../config';

export const NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE =
  'MUST AVOID any kind of text, letters, numbers, labels, or readable symbols.';

export function shouldCheckImageTextOrSymbols(): boolean {
  return config.image.validationCheckTextOrSymbols;
}

export function optionalNoVisibleTextRule(): string {
  return shouldCheckImageTextOrSymbols() ? NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE : '';
}

export function imageTextValidationPromptLines(
  briefLabel: string = 'scene brief'
): string[] {
  if (!shouldCheckImageTextOrSymbols()) {
    return [
      '- Text, letters, numbers, labels, watermarks, and symbol checks are disabled for this run.',
      '- Always set hasTextOrLetters=false. Do not report visible writing or symbols as an issue.',
    ];
  }

  return [
    '- Set hasTextOrLetters=true for unwanted readable text, letters, numbers, labels, watermarks, or alphanumeric symbols that are part of the generated artwork.',
    '- A reference-sheet title, label, filename, watermark, or identifier copied into Image 1 is unwanted text. Explicitly scan for REF_* identifiers such as REF_CH_* and set hasTextOrLetters=true when any are visible.',
    `- Decorative non-linguistic glyphs, runes, sigils, or symbols explicitly required by the ${briefLabel} are visual motifs, not unwanted text.`,
  ];
}
