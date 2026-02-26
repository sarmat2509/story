import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '@/theme';

export function StoryViewerSkeleton() {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 750 }),
        withTiming(0.5, { duration: 750 })
      ),
      -1,
      false
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Scene skeleton (image + text) */}
        <View style={styles.scene}>
          {/* Image placeholder */}
          <Animated.View style={[styles.imagePlaceholder, animatedStyle]} />
          
          {/* Text lines */}
          <View style={styles.textContainer}>
            <Animated.View style={[styles.textLine, styles.textLineLong, animatedStyle]} />
            <Animated.View style={[styles.textLine, styles.textLineFull, animatedStyle]} />
            <Animated.View style={[styles.textLine, styles.textLineMedium, animatedStyle]} />
            <Animated.View style={[styles.textLine, styles.textLineShort, animatedStyle]} />
          </View>
        </View>

        {/* Second scene skeleton */}
        <View style={styles.scene}>
          <Animated.View style={[styles.imagePlaceholder, animatedStyle]} />
          <View style={styles.textContainer}>
            <Animated.View style={[styles.textLine, styles.textLineFull, animatedStyle]} />
            <Animated.View style={[styles.textLine, styles.textLineMedium, animatedStyle]} />
            <Animated.View style={[styles.textLine, styles.textLineLong, animatedStyle]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  content: {
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[6],
  },
  scene: {
    marginBottom: theme.spacing[8],
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.background.tertiary,
    borderRadius: theme.borders.radius.md,
    marginBottom: theme.spacing[4],
  },
  textContainer: {
    paddingHorizontal: theme.spacing[6],
  },
  textLine: {
    height: 20,
    backgroundColor: theme.colors.background.tertiary,
    borderRadius: theme.borders.radius.sm,
    marginBottom: theme.spacing[2],
  },
  textLineFull: {
    width: '100%',
  },
  textLineLong: {
    width: '85%',
  },
  textLineMedium: {
    width: '70%',
  },
  textLineShort: {
    width: '50%',
  },
});
