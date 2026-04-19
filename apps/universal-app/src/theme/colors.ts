import { getActivePaletteId } from './activePalette';
import { PALETTE_REGISTRY } from './palettes';

// Resolve which palette to use at module-load time. Changing the palette
// requires an app reload because `StyleSheet.create()` captures colors once.
const activePalette = PALETTE_REGISTRY[getActivePaletteId()];

// Base color palette — shape kept identical to the previous static export so
// that none of the ~70 screens that read `theme.colors.*` need to change.
export const colors = {
  // Primary ramp, derived from the active palette
  primary: activePalette.primary,

  // Neutral (Slate) — shared across all palettes
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },

  success: {
    50: '#f0fdf4',
    500: '#10b981',
    600: '#059669',
  },

  error: {
    50: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },

  warning: {
    50: '#fef3c7',
    500: '#f59e0b',
    600: '#d97706',
  },

  white: '#ffffff',
  black: '#000000',

  google: '#4285F4',
  apple: '#000000',
};

// Semantic colors (usage-based) — also derived from the active palette
export const semanticColors = {
  background: {
    primary: activePalette.background.primary,
    secondary: activePalette.background.secondary,
    tertiary: colors.neutral[100],
    inverse: colors.neutral[900],
    hero: activePalette.background.hero,
  },

  text: {
    primary: activePalette.text.primary,
    secondary: activePalette.text.secondary,
    tertiary: activePalette.text.tertiary,
    disabled: colors.neutral[400],
    inverse: colors.white,
  },

  border: {
    light: activePalette.border.light,
    medium: colors.neutral[300],
    dark: colors.neutral[400],
  },

  interactive: {
    primary: colors.primary[500],
    primaryHover: colors.primary[600],
    primaryActive: colors.primary[700],
    secondary: colors.neutral[100],
    secondaryHover: colors.neutral[200],
  },

  status: {
    success: colors.success[500],
    error: colors.error[600],
    warning: colors.warning[500],
  },
};
