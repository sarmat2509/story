import {
  DEFAULT_THEME_PALETTE_ID,
  THEME_PALETTE_IDS,
  type ThemePaletteId,
} from '@wondertales/shared';

const STORAGE_KEY = 'wondertales.active_theme_palette';

function isValidPaletteId(value: unknown): value is ThemePaletteId {
  return typeof value === 'string' && (THEME_PALETTE_IDS as readonly string[]).includes(value);
}

/**
 * Synchronously read the active palette id on web.
 * Safe in SSR-style environments: returns default if `window.localStorage`
 * is unavailable or throws.
 */
export function getActivePaletteId(): ThemePaletteId {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_THEME_PALETTE_ID;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidPaletteId(stored)) {
      return stored;
    }
  } catch {
    // storage disabled / privacy mode → fall through
  }
  return DEFAULT_THEME_PALETTE_ID;
}

export function setActivePaletteId(id: ThemePaletteId): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!isValidPaletteId(id)) return;
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore write errors
  }
}
