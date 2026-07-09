import { createHash } from 'node:crypto';
import anyAscii from 'any-ascii';
import { stripCharacterIdFromName } from '@wondertales/shared';

export type VisualReferenceCharacterInput = {
  id?: string | null;
  name?: string | null;
  referenceBindingId?: string | null;
  turnaroundSheet?: { url?: string | null; frontUrl?: string | null } | null;
  referencePhotos?: Array<{ url?: string | null } | null> | null;
};

export type VisualCharacterReferenceLabel = {
  characterName: string;
  referenceId: string;
};

function referenceLabelSlug(name: string): string {
  const base = stripCharacterIdFromName(name).trim() || name.trim() || 'CHARACTER';
  const ascii = anyAscii(base)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return ascii || 'CHARACTER';
}

function shortStableHash(parts: Array<string | number | null | undefined>): string {
  const input = parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join('|');
  return createHash('sha1').update(input || 'character').digest('hex').slice(0, 6).toUpperCase();
}

export function plannedCharacterReferenceIdForName(
  name: string,
  stableKey?: string | null
): string {
  const cleanName = stripCharacterIdFromName(name).trim() || name;
  return `REF_CH_${referenceLabelSlug(cleanName)}_${shortStableHash([stableKey || cleanName])}`;
}

function hasUsableVisualReference(character: VisualReferenceCharacterInput): boolean {
  const turnaround = character.turnaroundSheet;
  return !!(
    turnaround?.url ||
    turnaround?.frontUrl ||
    (character.referencePhotos || []).some((photo) => !!photo?.url)
  );
}

export function plannedCharacterReferenceIdForCharacter(
  character: VisualReferenceCharacterInput
): string | null {
  const existing = String(character.referenceBindingId || '').trim();
  if (existing) return existing;

  const name = stripCharacterIdFromName(String(character.name || '')).trim();
  if (!name || !hasUsableVisualReference(character)) return null;
  return plannedCharacterReferenceIdForName(name, character.id || name);
}

export function visualCharacterReferenceLabelsFromCharacters(
  characters: VisualReferenceCharacterInput[] | undefined
): VisualCharacterReferenceLabel[] {
  const seen = new Set<string>();
  const labels: VisualCharacterReferenceLabel[] = [];
  for (const character of characters ?? []) {
    const characterName = stripCharacterIdFromName(String(character?.name || '')).trim();
    if (!characterName) continue;
    const key = characterName.normalize('NFC').toLocaleLowerCase();
    if (seen.has(key)) continue;
    const referenceId = plannedCharacterReferenceIdForCharacter(character);
    if (!referenceId) continue;
    seen.add(key);
    labels.push({ characterName, referenceId });
  }
  return labels;
}

export function visualCharacterReferenceLabelRegistryLines(
  labels: VisualCharacterReferenceLabel[] | undefined
): string[] {
  return (labels ?? []).map((label) => `- ${label.characterName} => ${label.referenceId}`);
}
