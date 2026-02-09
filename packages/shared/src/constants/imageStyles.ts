/**
 * Image Style Constants
 * Single source of truth for all image/art styles
 */

export const IMAGE_STYLES = [
  'soft_watercolor',
  'colored_pencil',
  'comic_line',
  'anime_light',
  'retro_magical_shojo',
  'warm_3d',
  'night_calm',
  'felt_craft',
  'clay',
] as const;

export type ImageStyle = typeof IMAGE_STYLES[number];

/**
 * UI metadata for image styles (icons and translation keys)
 * Used by frontend components
 */
export const IMAGE_STYLE_METADATA: Record<ImageStyle, { icon: string; i18nKey: string }> = {
  soft_watercolor: { icon: '🎨', i18nKey: 'wizard.style_watercolor' },
  colored_pencil: { icon: '✏️', i18nKey: 'wizard.style_pencil' },
  comic_line: { icon: '💭', i18nKey: 'wizard.style_comic' },
  anime_light: { icon: '🌸', i18nKey: 'wizard.style_anime' },
  retro_magical_shojo: { icon: '✨', i18nKey: 'wizard.style_retro_magical_shojo' },
  warm_3d: { icon: '🎬', i18nKey: 'wizard.style_3d' },
  night_calm: { icon: '🌙', i18nKey: 'wizard.style_night' },
  felt_craft: { icon: '🧵', i18nKey: 'wizard.style_felt' },
  clay: { icon: '🪴', i18nKey: 'wizard.style_clay' },
};
