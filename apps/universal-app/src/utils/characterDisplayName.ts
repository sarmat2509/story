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
