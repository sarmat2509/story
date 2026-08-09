import config from '../../config';

export const NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE =
  'MUST OUTPUT ONLY the continuous storybook illustration: no text, letters, numbers, labels, readable symbols, title cards, captions, legends, reference-sheet layouts, UI cards, or descriptive/metadata blocks.';

export function shouldCheckImageTextOrSymbols(): boolean {
  return config.image.validationCheckTextOrSymbols;
}

export function optionalNoVisibleTextRule(): string {
  return shouldCheckImageTextOrSymbols() ? NO_VISIBLE_TEXT_OR_REFERENCE_LABELS_RULE : '';
}

export function imageTextValidationPromptLines(
  briefLabel: string = 'scene brief'
): string[] {
  return [
    '- Image 1 must contain only the continuous storybook illustration. Set hasTextOrLetters=true for any readable or garbled text, letters, numbers, labels, watermarks, filenames, identifiers, or alphanumeric symbols that are part of the generated artwork.',
    '- Set hasTextOrLetters=true for any non-illustration presentation element: title card, caption/description/information panel, legend/key, reference-sheet/contact-sheet layout, UI card, label strip, bordered plaque, or solid/white/rectangular metadata block. Reject it even when its writing is too small or garbled to read.',
    '- A reference-sheet title, label, filename, watermark, or identifier copied into Image 1 is always unwanted. Explicitly scan for REF_* identifiers such as REF_CH_* and REF_ENV_*; for example, a bottom strip reading "SECRET_CAVERN (REF_ENV)" must set hasTextOrLetters=true.',
    `- Decorative non-linguistic glyphs, runes, sigils, or symbols explicitly required by the ${briefLabel} are visual motifs, not unwanted text.`,
  ];
}
