/**
 * Remove [ID: xxx] suffix from character name for display.
 * E.g. "Остап [ID: ost-456]" -> "Остап"
 */
export function stripCharacterIdFromName(name: string): string {
  if (!name) return name;
  return name.replace(/\s*\[ID:\s*[^\]]+\]/g, '').trim();
}
