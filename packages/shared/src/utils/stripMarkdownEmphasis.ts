/**
 * Remove **word** wrappers used as ElevenLabs / narration emphasis markers from display text.
 * Preserves newlines; does not collapse paragraph spacing (unlike aggressive whitespace trim).
 */
export function stripMarkdownStyleEmphasis(text: string): string {
  if (!text) return text;
  let result = text;
  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  }
  return result;
}
