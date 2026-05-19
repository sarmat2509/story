import { createMMKV } from 'react-native-mmkv';
import type { MMKV } from 'react-native-mmkv';
import {
  DEFAULT_THEME_PALETTE_ID,
  THEME_PALETTE_IDS,
  type ThemePaletteId,
} from '@wondertales/shared';

const STORAGE_KEY = 'wondertales.active_theme_palette';

// Dedicated MMKV instance for theme state — separate from the app store so
// reads are safe at module load (JSI-backed, synchronous).
let _storage: MMKV | null = null;
function getStorage(): MMKV | null {
  if (_storage) return _storage;
  try {
    _storage = createMMKV({ id: 'wondertales.theme' });
    return _storage;
  } catch {
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
