import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface AnimatedSectionProps {
  children: React.ReactNode;
  /** milliseconds to delay the start (useful for staggering siblings) */
  delay?: number;
  /** total duration of the entrance animation */
  duration?: number;
  /** initial translateY offset before the element settles at 0 */
  translate?: number;
  /**
   * When this value changes, the entrance animation replays from the start.
   * Pair with `useScreenEnter()` to re-trigger on every screen focus.
   * If omitted, the animation runs once on mount.
   */
  trigger?: unknown;
  style?: StyleProp<ViewStyle>;
}

/**
 * A tiny entrance-animation wrapper.
 * Fades from 0 → 1 and slides up from `translate`px → 0, in parallel.
 * Respects the user's Reduce Motion preference (iOS/Android/web).
 * Optionally replays when `trigger` changes (e.g. navigation focus).
 */
export function AnimatedSection({
  children,
  delay = 0,
  duration = 450,
  translate = 12,
  trigger,
  style,
}: AnimatedSectionProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(translate)).current;

  useEffect(() => {
    let cancelled = false;

    // reset to the "before" state so the animation replays from scratch
    opacity.setValue(0);
    translateY.setValue(translate);

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;

      if (reduceMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => {
      cancelled = true;
    };
  }, [delay, duration, opacity, translateY, translate, trigger]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

export default AnimatedSection;
