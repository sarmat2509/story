/**
 * Remove [ID: xxx] suffix from character name for display.
 * E.g. "Остап [ID: ost-456]" -> "Остап"
 */
export function stripCharacterIdFromName(name: string): string {
  if (!name) return name;
  // NFC-normalize so names with composed/decomposed diacritics (e.g. Ukrainian
  // apostrophe) match consistently across scene rosters, references, and DB.
  return name.normalize('NFC').replace(/\s*\[ID:\s*[^\]]+\]/g, '').trim();
}
