import { Platform } from 'react-native';
import type { ThemePaletteId } from '@wondertales/shared';

type Impl = {
  getActivePaletteId(): ThemePaletteId;
  setActivePaletteId(id: ThemePaletteId): void;
};

function getImpl(): Impl {
  return Platform.OS === 'web'
    ? (require('./activePalette.web') as typeof import('./activePalette.web'))
    : (require('./activePalette.native') as typeof import('./activePalette.native'));
}

/**
 * Read the active UI palette id synchronously.
 * On web uses `localStorage`, on native uses MMKV (JSI, sync).
 * Safe to call at module load time — used by `theme/colors.ts` to derive
 * the active palette before the first `StyleSheet.create()` is evaluated.
 */
export function getActivePaletteId(): ThemePaletteId {
  return getImpl().getActivePaletteId();
}

export function setActivePaletteId(id: ThemePaletteId): void {
  getImpl().setActivePaletteId(id);
}
