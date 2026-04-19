import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type ExtendedPressableState = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};

interface InteractiveSurfaceProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Base style applied to the interactive surface. */
  style?: StyleProp<ViewStyle>;
  /** Extra style merged when hovered (web). */
  hoverStyle?: StyleProp<ViewStyle>;
  /** Extra style merged when pressed. */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Color of the hover tint overlay (animated). Defaults to a soft white sheen. */
  hoverTint?: string;
  /** Color of the press tint overlay (animated). Defaults to a dusk ink. */
  pressTint?: string;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}

/**
 * Generic interactive wrapper — shadow + color tints only (no scale / transform).
 * Exposes clean hover / press / focus states across every platform.
 * Respects Reduce Motion (instantly snaps to target state).
 */
export function InteractiveSurface({
  children,
  onPress,
  disabled,
  style,
  hoverStyle,
  pressedStyle,
  hoverTint = 'rgba(255, 255, 255, 0.35)',
  pressTint = 'rgba(59, 46, 110, 0.08)',
  accessibilityLabel,
  accessibilityRole = 'button',
}: InteractiveSurfaceProps) {
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

  const animateTo = React.useCallback((anim: Animated.Value, to: number) => {
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
      disabled={disabled}
      onHoverIn={() => !disabled && animateTo(hoverAnim, 1)}
      onHoverOut={() => animateTo(hoverAnim, 0)}
      onPressIn={() => !disabled && animateTo(pressAnim, 1)}
      onPressOut={() => animateTo(pressAnim, 0)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      focusable
      style={(state: ExtendedPressableState) => [
        webBase,
        style,
        state.hovered && !disabled && hoverStyle,
        state.hovered && !disabled && webHoverShadow,
        state.pressed && !disabled && webPressedShadow,
        state.pressed && !disabled && pressedStyle,
        state.focused && !disabled && webFocusRing,
        disabled && styles.disabled,
      ]}
    >
      {/* hover tint (soft sheen) */}
      <Animated.View
        pointerEvents="none"
        style={[styles.overlay, { backgroundColor: hoverTint, opacity: hoverAnim }]}
      />
      {/* press tint (darker ink) */}
      <Animated.View
        pointerEvents="none"
        style={[styles.overlay, { backgroundColor: pressTint, opacity: pressAnim }]}
      />
      {children}
    </Pressable>
  );
}

const webBase: ViewStyle = Platform.select({
  web: {
    // keep transition in the base style so shadow fades in AND out smoothly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transition: 'box-shadow 220ms ease' as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor: 'pointer' as any,
  },
  default: {},
}) as ViewStyle;

const webHoverShadow: ViewStyle = Platform.select({
  web: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    boxShadow: '0 14px 28px -14px rgba(59, 46, 110, 0.38)' as any,
  },
  default: {},
}) as ViewStyle;

const webPressedShadow: ViewStyle = Platform.select({
  web: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    boxShadow: '0 4px 10px -6px rgba(59, 46, 110, 0.35)' as any,
  },
  default: {},
}) as ViewStyle;

const webFocusRing: ViewStyle = Platform.select({
  web: {
    outlineStyle: 'solid' as unknown as ViewStyle['borderStyle'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outlineColor: 'rgba(123, 102, 199, 0.85)' as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outlineWidth: 3 as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outlineOffset: 3 as any,
  },
  default: {},
}) as ViewStyle;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  disabled: {
    opacity: 0.55,
  },
});

export default InteractiveSurface;
