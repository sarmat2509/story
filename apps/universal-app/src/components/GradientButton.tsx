import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
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
import { LinearGradient } from '@/components/AppLinearGradient';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

type GradientButtonVariant = 'primary' | 'subtle';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  variant?: GradientButtonVariant;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

// react-native-web extends Pressable state with `hovered` and `focused`.
// Native PressableStateCallbackType only has `pressed`, so we widen here.
type ExtendedPressableState = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};

/** Primary CTA: deep → mid → light stops from the active palette. */
function primaryGradientColors(): readonly [string, string, string] {
  const p = theme.colors.primary;
  return [p[800], p[500], p[400]];
}

function subtleGradientColors(): readonly [string, string] {
  const p = theme.colors.primary;
  return [p[100], theme.colors.background.hero];
}

const p9 = theme.colors.primary[900];
const p5 = theme.colors.primary[500];

const shadowStyles = {
  base: Platform.select({
    ios: {
      shadowColor: p9,
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 4 },
    web: {
      boxShadow: `0 6px 14px -6px ${hexAlpha(p9, 0.4)}`,
      cursor: 'pointer',
      transition: 'box-shadow 200ms ease',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  hovered: Platform.select({
    ios: {
      shadowColor: p9,
      shadowOpacity: 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 7 },
    web: {
      boxShadow: `0 10px 20px -8px ${hexAlpha(p9, 0.5)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  pressed: Platform.select({
    ios: {
      shadowColor: p9,
      shadowOpacity: 0.16,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 2 },
    web: {
      boxShadow: `0 3px 8px -4px ${hexAlpha(p9, 0.42)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  focused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineColor: hexAlpha(p5, 0.88),
      outlineWidth: 3,
      outlineOffset: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
};

export function GradientButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  leading,
  trailing,
  variant = 'primary',
  style,
  labelStyle,
  accessibilityLabel,
}: GradientButtonProps) {
  const colors = variant === 'primary' ? primaryGradientColors() : subtleGradientColors();
  const isDisabled = disabled || loading;

  // Cross-fade two overlays instead of using transform/scale.
  // `hoverOverlay` → white sheen that fades in on hover/focus.
  // `pressOverlay` → dusk ink that fades in on press.
  const hoverAnim = React.useRef(new Animated.Value(0)).current;
  const pressAnim = React.useRef(new Animated.Value(0)).current;
  const reduceMotionRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) reduceMotionRef.current = v;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setValue = React.useCallback((anim: Animated.Value, to: number) => {
    if (reduceMotionRef.current) {
      anim.setValue(to);
      return;
    }
    Animated.timing(anim, {
      toValue: to,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onHoverIn={() => setValue(hoverAnim, 1)}
      onHoverOut={() => setValue(hoverAnim, 0)}
      onPressIn={() => setValue(pressAnim, 1)}
      onPressOut={() => setValue(pressAnim, 0)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      focusable
      style={(state: ExtendedPressableState) => [
        styles.wrapper,
        shadowStyles.base,
        state.hovered && !isDisabled && shadowStyles.hovered,
        state.pressed && !isDisabled && shadowStyles.pressed,
        state.focused && !isDisabled && shadowStyles.focused,
        isDisabled && styles.wrapperDisabled,
        style,
      ]}
    >
      <View style={styles.inner}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator
                color={
                  variant === 'primary' ? theme.colors.text.inverse : theme.colors.text.primary
                }
              />
            ) : (
              <>
                {leading}
                <Text
                  style={[styles.label, variant === 'subtle' && styles.labelSubtle, labelStyle]}
                >
                  {label}
                </Text>
                {trailing}
              </>
            )}
          </View>
          {/* static glossy highlight along the top edge */}
          <View pointerEvents="none" style={styles.highlight} />
          {/* hover sheen — fades in on hover/focus */}
          <Animated.View
            pointerEvents="none"
            style={[styles.hoverOverlay, { opacity: hoverAnim }]}
          />
          {/* press ink — fades in on press */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pressOverlay,
              { backgroundColor: hexAlpha(theme.colors.primary[900], 0.22) },
              { opacity: pressAnim },
            ]}
          />
        </LinearGradient>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: theme.borders.radius.lg,
  },
  wrapperDisabled: {
    opacity: 0.55,
  },
  inner: {
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: theme.borders.radius.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    minHeight: 52,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    borderTopLeftRadius: theme.borders.radius.lg,
    borderTopRightRadius: theme.borders.radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  hoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: theme.borders.radius.lg,
  },
  pressOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borders.radius.lg,
  },
  label: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.2,
  },
  labelSubtle: {
    color: theme.colors.text.primary,
  },
});

export default GradientButton;
