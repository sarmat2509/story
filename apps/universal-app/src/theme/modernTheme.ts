import { Platform, type ViewStyle } from 'react-native';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

export const modernColors = {
  page: theme.colors.background.primary,
  pageMuted: theme.colors.background.secondary,
  surface: theme.colors.background.primary,
  surfaceMuted: hexAlpha(theme.colors.primary[50], 0.52),
  border: hexAlpha(theme.colors.primary[200], 0.58),
  borderStrong: hexAlpha(theme.colors.primary[300], 0.72),
  accentSoft: hexAlpha(theme.colors.primary[100], 0.7),
  accentWash: hexAlpha(theme.colors.primary[50], 0.84),
};

export const modernGradients = {
  page: [theme.colors.background.primary, modernColors.accentWash] as [string, string],
  hero: [theme.colors.background.primary, modernColors.accentSoft] as [string, string],
  primary: [theme.colors.primary[700], theme.colors.primary[500]] as [string, string],
};

export const modernShadows = {
  card: Platform.select({
    ios: {
      shadowColor: theme.colors.primary[900],
      shadowOpacity: 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
    },
    android: { elevation: 3 },
    web: {
      boxShadow: `0 18px 48px -34px ${hexAlpha(theme.colors.primary[900], 0.3)}`,
    } as unknown as ViewStyle,
    default: {},
  }) as ViewStyle,
  raised: Platform.select({
    ios: {
      shadowColor: theme.colors.primary[900],
      shadowOpacity: 0.12,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
    },
    android: { elevation: 5 },
    web: {
      boxShadow: `0 24px 64px -34px ${hexAlpha(theme.colors.primary[900], 0.36)}`,
    } as unknown as ViewStyle,
    default: {},
  }) as ViewStyle,
  subtle: Platform.select({
    ios: {
      shadowColor: theme.colors.primary[900],
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    web: {
      boxShadow: `0 10px 30px -24px ${hexAlpha(theme.colors.primary[900], 0.24)}`,
    } as unknown as ViewStyle,
    default: {},
  }) as ViewStyle,
};
