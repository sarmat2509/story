import { stripCharacterIdFromName } from '@wondertales/shared';

export interface LocalizedCharacterDisplayName {
  name: string;
  localizedName?: string | null;
  nameTranslations?: Record<string, string | null | undefined>;
}

export function normalizeInterfaceLocale(locale?: string | null): string | null {
  return locale?.split('-')[0]?.toLowerCase() || null;
}

export function getCharacterDisplayName(
  character: LocalizedCharacterDisplayName,
  interfaceLocale?: string | null
): string {
  const locale = normalizeInterfaceLocale(interfaceLocale);
  const translatedName = locale ? character.nameTranslations?.[locale] : null;
  const candidate = translatedName || character.name || character.localizedName || '';
  const displayName = stripCharacterIdFromName(candidate).trim();
  return displayName || stripCharacterIdFromName(character.name).trim();
}

/**
 * Story metadata stores `name` as the spelling used by that story's writer.
 * Never replace it with the interface-language translation: readers must see
 * the same name in the character panel as they see in the story text.
 */
export function getStoryCharacterDisplayName(character: LocalizedCharacterDisplayName): string {
  const displayName = stripCharacterIdFromName(character.name || character.localizedName || '').trim();
  return displayName || stripCharacterIdFromName(character.localizedName || '').trim();
}
