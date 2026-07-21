/**
 * Comic-to-text stories are a companion format to comics: a plan offers both
 * formats or neither. A user's monthly mix can still allocate zero capacity
 * to one of the formats; that is not a plan-upgrade restriction.
 */
export function planAllowsComicFormats(
  graphicNovelsPerMonth: number | null | undefined
): boolean {
  return typeof graphicNovelsPerMonth === 'number' && graphicNovelsPerMonth !== 0;
}
