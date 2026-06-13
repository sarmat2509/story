import {
  DEFAULT_THEME_PALETTE_ID,
  THEME_PALETTE_IDS,
  type ThemePaletteId,
} from '@wondertales/shared';

const STORAGE_KEY = 'wondertales.active_theme_palette';

// Dedicated MMKV instance for theme state — separate from the app store so
// reads are safe at module load (JSI-backed, synchronous).
type ThemePaletteStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

let _storage: ThemePaletteStorage | null | undefined;

function getStorage(): ThemePaletteStorage | null {
  if (_storage !== undefined) return _storage;

  try {
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    _storage = createMMKV({ id: 'wondertales.theme' });
    return _storage;
  } catch {
    _storage = null;
    return null;
  }
}

function isValidPaletteId(value: unknown): value is ThemePaletteId {
  return typeof value === 'string' && (THEME_PALETTE_IDS as readonly string[]).includes(value);
}

/** Synchronously read the active palette id on native (MMKV). */
export function getActivePaletteId(): ThemePaletteId {
  try {
    const stored = getStorage()?.getString(STORAGE_KEY);
    if (isValidPaletteId(stored)) {
      return stored;
    }
  } catch {
    // MMKV not ready / native module missing → fall through
  }
  return DEFAULT_THEME_PALETTE_ID;
}

export function setActivePaletteId(id: ThemePaletteId): void {
  try {
    if (!isValidPaletteId(id)) return;
    getStorage()?.set(STORAGE_KEY, id);
  } catch {
    // ignore write errors
  }
}
