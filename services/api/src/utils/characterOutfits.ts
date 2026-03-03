/**
 * Parse/serialize characterOutfits between string (LLM) and Record (image gen).
 * Format: "Name1: outfit1. Name2: outfit2." or "Name1: outfit1; Name2: outfit2."
 */

/**
 * Parse characterOutfits string to Record for downstream use.
 * Handles: "Emilia: yellow pajamas. Flash: natural appearance."
 */
export function parseCharacterOutfitsString(str: string): Record<string, string> {
  if (!str || typeof str !== 'string') return {};
  const trimmed = str.trim();
  if (!trimmed) return {};

  const result: Record<string, string> = {};
  const segments = trimmed.split(/[.;]/).map(s => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const colonIdx = segment.indexOf(':');
    if (colonIdx === -1) continue;
    const name = segment.slice(0, colonIdx).trim();
    const outfit = segment.slice(colonIdx + 1).trim();
    if (name && outfit) result[name] = outfit;
  }

  return result;
}

/**
 * Serialize Record to string for LLM output / fill fallback.
 */
export function serializeCharacterOutfitsToStr(record: Record<string, string>): string {
  if (!record || Object.keys(record).length === 0) return '';
  return Object.entries(record)
    .map(([name, outfit]) => `${name}: ${outfit}`)
    .join('. ');
}
