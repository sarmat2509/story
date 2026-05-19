import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { InteractiveSurface } from '@/components/InteractiveSurface';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

const VIEW_SHADOW = hexAlpha(theme.colors.primary[900], 0.28);

/**
 * Rim: one step darker than the darkest gradient stop (`primary[100]` in `glassGradientColors`),
 * so the edge matches the fill rather than mid-tone `primary[500]`.
 */
const SHELL_BORDER = hexAlpha(theme.colors.primary[200], 0.48);

/** Soft thematic wash — reads as a button, stays lighter than solid primary CTAs. */
function glassGradientColors(): readonly [string, string, string] {
  const p = theme.colors.primary;
  return [hexAlpha(p[100], 0.72), hexAlpha(p[50], 0.5), 'rgba(255, 255, 255, 0.88)'];
}

const shellShadow = Platform.select({
  ios: {
    shadowColor: theme.colors.primary[900],
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  android: { elevation: 3 },
  web: {
    boxShadow: `0 18px 34px -20px ${VIEW_SHADOW}` as unknown as string,
  },
});

export type GlassPrimaryButtonSize = 'prominent' | 'footer' | 'hero';

interface GlassPrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Default: matches dashboard / library CTAs; `footer` for modal footers; `hero` for wizard primary. */
  size?: GlassPrimaryButtonSize;
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function GlassPrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  size = 'prominent',
  leading,
  style,
  textStyle,
  accessibilityLabel,
}: GlassPrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const dimmed = disabled && !loading;

  return (
    <View
      style={[
        styles.shell,
        size === 'footer' && styles.shellFooter,
        size === 'hero' && styles.shellHero,
        !(size === 'footer' || size === 'hero') && styles.shellProminent,
        dimmed && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={[...glassGradientColors()]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        pointerEvents="none"
        style={styles.gradientFill}
      />
      <InteractiveSurface
        style={[
          styles.interactive,
          size === 'footer' && styles.interactiveFooter,
          size === 'hero' && styles.interactiveHero,
          !(size === 'footer' || size === 'hero') && styles.interactiveProminent,
        ]}
        onPress={onPress}
        disabled={isDisabled}
        accessibilityLabel={accessibilityLabel ?? title}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.primary[700]} />
        ) : leading ? (
          <View style={styles.innerRow}>
            {leading}
            <Text
              style={[
                styles.label,
                size === 'hero' && styles.labelHero,
                styles.labelAfterIcon,
                textStyle,
              ]}
            >
              {title}
            </Text>
          </View>
        ) : (
          <Text style={[styles.label, size === 'hero' && styles.labelHero, textStyle]}>
            {title}
          </Text>
        )}
      </InteractiveSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: SHELL_BORDER,
    ...shellShadow,
  },
  shellProminent: {
    borderRadius: theme.borders.radius.lg,
  },
  shellFooter: {
    borderRadius: theme.borders.radius.md,
  },
  shellHero: {
    borderRadius: theme.borders.radius.lg,
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  interactive: {
    zIndex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
    borderWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  interactiveProminent: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  interactiveFooter: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  interactiveHero: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[2],
  },
  disabled: {
    opacity: 0.5,
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
    textAlign: 'center',
  },
  labelAfterIcon: {
    flexShrink: 1,
  },
  labelHero: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
});
