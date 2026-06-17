import { Platform, type ViewStyle } from 'react-native';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

export const modernColors = {
  page: theme.colors.background.primary,
  pageMuted: theme.colors.background.secondary,
  surface: theme.colors.background.primary,
  surfaceMuted: hexAlpha(theme.colors.primary[50], 0.34),
  surfaceRaised: hexAlpha('#FFFFFF', 0.96),
  border: hexAlpha(theme.colors.primary[200], 0.34),
  borderStrong: hexAlpha(theme.colors.primary[300], 0.48),
  accentSoft: hexAlpha(theme.colors.primary[100], 0.5),
  accentWash: hexAlpha(theme.colors.primary[50], 0.68),
  accentWarm: '#FF8A5B',
  accentWarmSoft: '#FFF0E8',
  accentMint: '#7BC8B2',
  accentMintSoft: '#EAF8F4',
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
      boxShadow: `0 22px 56px -36px ${hexAlpha(theme.colors.primary[900], 0.22)}`,
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
      boxShadow: `0 28px 80px -38px ${hexAlpha(theme.colors.primary[900], 0.28)}`,
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
      boxShadow: `0 14px 34px -26px ${hexAlpha(theme.colors.primary[900], 0.16)}`,
    } as unknown as ViewStyle,
    default: {},
  }) as ViewStyle,
};
