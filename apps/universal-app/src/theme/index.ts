import { colors, semanticColors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { borders } from './borders';
import { breakpoints, layout } from './breakpoints';

export const theme = {
  colors: {
    ...colors,
    ...semanticColors,
  },
  typography,
  spacing,
  borders,
  breakpoints,
  layout,
};

export type Theme = typeof theme;

// Re-export for convenience
export { colors, semanticColors, typography, spacing, borders, breakpoints, layout };
