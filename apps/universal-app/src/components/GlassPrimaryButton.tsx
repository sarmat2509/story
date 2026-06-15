import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { InteractiveSurface } from '@/components/InteractiveSurface';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';
import { modernGradients, modernShadows } from '@/theme/modernTheme';

const SHELL_BORDER = hexAlpha(theme.colors.primary[600], 0.18);

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
          <ActivityIndicator color={theme.colors.text.inverse} />
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
    backgroundColor: modernGradients.primary[0],
    ...modernShadows.card,
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
  interactive: {
    zIndex: 1,
    position: 'relative',
    backgroundColor: theme.colors.interactive.primary,
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
    color: theme.colors.text.inverse,
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
