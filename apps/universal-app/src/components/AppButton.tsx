import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';
import { modernColors, modernShadows } from '@/theme/modernTheme';

export type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerSecondary' | 'ghost';
export type AppButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

type ExtendedPressableState = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};

const webFocusRing: ViewStyle = Platform.select({
  web: {
    outlineStyle: 'solid' as unknown as ViewStyle['borderStyle'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outlineColor: hexAlpha(theme.colors.primary[500], 0.86) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outlineWidth: 3 as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outlineOffset: 3 as any,
  },
  default: {},
}) as ViewStyle;

const webCursor: ViewStyle = Platform.select({
  web: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor: 'pointer' as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transition:
      'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease' as any,
  },
  default: {},
}) as ViewStyle;

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  leading,
  trailing,
  style,
  labelStyle,
  accessibilityLabel,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const isDanger = variant === 'danger' || variant === 'dangerSecondary';
  const isFilled = variant === 'primary' || variant === 'danger';
  const loaderColor = isFilled
    ? theme.colors.text.inverse
    : isDanger
      ? theme.colors.status.error
      : theme.colors.interactive.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      focusable
      style={(state: ExtendedPressableState) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        size === 'md' && styles.buttonMd,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'dangerSecondary' && styles.dangerSecondary,
        variant === 'ghost' && styles.ghost,
        state.hovered && !isDisabled && variant === 'primary' && styles.primaryHovered,
        state.hovered && !isDisabled && variant === 'secondary' && styles.secondaryHovered,
        state.hovered && !isDisabled && variant === 'danger' && styles.dangerHovered,
        state.hovered && !isDisabled && variant === 'dangerSecondary' && styles.dangerSecondaryHovered,
        state.hovered && !isDisabled && variant === 'ghost' && styles.ghostHovered,
        state.pressed && !isDisabled && styles.pressed,
        state.focused && !isDisabled && webFocusRing,
        isDisabled && styles.disabled,
        webCursor,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={loaderColor} />
      ) : (
        <View style={styles.content}>
          {leading}
          <Text
            style={[
              styles.label,
              size === 'sm' && styles.labelSm,
              variant === 'secondary' && styles.secondaryLabel,
              variant === 'dangerSecondary' && styles.dangerSecondaryLabel,
              variant === 'ghost' && styles.ghostLabel,
              labelStyle,
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
          {trailing}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: hexAlpha(theme.colors.interactive.primary, 0.08),
    backgroundColor: theme.colors.interactive.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...modernShadows.card,
  },
  buttonMd: {
    minHeight: 48,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
  },
  buttonSm: {
    minHeight: 40,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
  },
  secondary: {
    backgroundColor: modernColors.surfaceMuted,
    borderColor: hexAlpha(theme.colors.primary[200], 0.16),
    shadowOpacity: 0,
    elevation: 0,
  },
  danger: {
    backgroundColor: theme.colors.status.error,
    borderColor: theme.colors.status.error,
  },
  dangerSecondary: {
    backgroundColor: theme.colors.error[50],
    borderColor: hexAlpha(theme.colors.status.error, 0.16),
    shadowOpacity: 0,
    elevation: 0,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryHovered: {
    backgroundColor: theme.colors.interactive.primaryHover,
    borderColor: theme.colors.interactive.primaryHover,
    ...Platform.select({
      web: {
        transform: [{ translateY: -1 }],
      },
      default: {},
    }),
  },
  secondaryHovered: {
    backgroundColor: modernColors.accentWash,
    borderColor: hexAlpha(theme.colors.primary[300], 0.2),
    ...Platform.select({
      web: {
        transform: [{ translateY: -1 }],
      },
      default: {},
    }),
  },
  dangerHovered: {
    backgroundColor: theme.colors.error[700],
    borderColor: theme.colors.error[700],
    ...Platform.select({
      web: {
        transform: [{ translateY: -1 }],
      },
      default: {},
    }),
  },
  dangerSecondaryHovered: {
    backgroundColor: hexAlpha(theme.colors.status.error, 0.1),
  },
  ghostHovered: {
    backgroundColor: modernColors.surfaceMuted,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.55,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 22,
  },
  labelSm: {
    fontSize: theme.typography.fontSize.sm,
  },
  secondaryLabel: {
    color: theme.colors.text.primary,
  },
  dangerSecondaryLabel: {
    color: theme.colors.status.error,
  },
  ghostLabel: {
    color: theme.colors.text.secondary,
  },
});

export default AppButton;
