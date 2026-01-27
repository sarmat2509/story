import { colors, semanticColors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { borders } from './borders';

export const theme = {
  colors: {
    ...colors,
    ...semanticColors,
  },
  typography,
  spacing,
  borders,
};

export type Theme = typeof theme;

// Re-export for convenience
export { colors, semanticColors, typography, spacing, borders };
