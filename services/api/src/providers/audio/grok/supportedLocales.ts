/**
 * Grok / xAI TTS — which **app story/UI locales** we expose in WonderTales.
 *
 * xAI documents these BCP-47 `language` values (plus `auto`): `en`, `ar-EG`, `ar-SA`,
 * `ar-AE`, `bn`, `zh`, `fr`, `de`, `hi`, `id`, `it`, `ja`, `ko`, `pt-BR`, `pt-PT`, `ru`,
 * `es-MX`, `es-ES`, `tr`, `vi`. Ukrainian (`uk`) is **not** listed; we do not offer Grok
 * for Ukrainian stories (use Google / ElevenLabs / OpenAI).
 *
 * We ship Grok for app locales that map cleanly to xAI codes in {@link mapAppLocaleToXaiLanguage}
 * (`pl` → `auto`). Arabic etc. are omitted until the app supports those locales.
 *
 * @see https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
 */
export const GROK_TTS_SUPPORTED_APP_LOCALES = ['en', 'ru', 'es', 'de', 'fr', 'pl'] as const;

export type GrokTtsAppLocale = (typeof GROK_TTS_SUPPORTED_APP_LOCALES)[number];

export function isGrokSupportedAppLocale(locale: string): locale is GrokTtsAppLocale {
  return (GROK_TTS_SUPPORTED_APP_LOCALES as readonly string[]).includes(locale);
}

/** Grok must not be used when the story (or voice picker) language is Ukrainian. */
export function isGrokBlockedForStoryLanguage(storyLanguage: string): boolean {
  return storyLanguage === 'uk';
}
