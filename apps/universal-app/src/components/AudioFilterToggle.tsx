import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  type PressableStateCallbackType,
} from 'react-native';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

type ExtendedPressableState = PressableStateCallbackType & {
  hovered?: boolean;
  focused?: boolean;
};

interface Props {
  allStoriesLabel: string;
  audioOnlyLabel: string;
  initialValue?: boolean; // Only used for initial useState, NOT reactive
  onToggle: (newValue: boolean) => void;
}

export interface AudioFilterToggleRef {
  setValue: (value: boolean) => void;
}

const AudioFilterToggleComponent = forwardRef<AudioFilterToggleRef, Props>(
  ({ allStoriesLabel, audioOnlyLabel, initialValue = false, onToggle }, ref) => {
    // LOCAL state - initialized ONLY on first render (lazy initialization)
    const [isActive, setIsActive] = useState(() => initialValue);

    // Expose imperative method to parent (no re-render)
    useImperativeHandle(ref, () => ({
      setValue: (value: boolean) => {
        setIsActive(value);
      },
    }));

    // Handle click - update local state and notify parent
    const handleToggle = () => {
      const newValue = !isActive;

      setIsActive(newValue);
      onToggle(newValue);
    };

    return (
      <View style={styles.segmentedControl}>
        <Pressable
          onPress={() => isActive && handleToggle()}
          accessibilityLabel={allStoriesLabel}
          focusable
          style={(state: ExtendedPressableState) => [
            styles.segment,
            Platform.OS === 'web' && state.hovered && styles.segmentHovered,
            state.pressed && styles.segmentPressed,
            Platform.OS === 'web' && state.focused && styles.segmentFocused,
          ]}
        >
          <Text style={[styles.segmentText, !isActive && styles.segmentTextActive]}>
            {allStoriesLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleToggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: isActive }}
          focusable
          style={(state: ExtendedPressableState) => [
            styles.toggleContainer,
            Platform.OS === 'web' && state.hovered && styles.toggleContainerHovered,
            state.pressed && styles.toggleContainerPressed,
            Platform.OS === 'web' && state.focused && styles.toggleContainerFocused,
          ]}
        >
          <View
            style={[
              styles.toggleTrack,
              {
                backgroundColor: isActive
                  ? theme.colors.interactive.primary
                  : theme.colors.neutral[300],
              },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                {
                  transform: [{ translateX: isActive ? 20 : 0 }],
                },
              ]}
            />
          </View>
        </Pressable>

        <Pressable
          onPress={() => !isActive && handleToggle()}
          accessibilityLabel={audioOnlyLabel}
          focusable
          style={(state: ExtendedPressableState) => [
            styles.segment,
            Platform.OS === 'web' && state.hovered && styles.segmentHovered,
            state.pressed && styles.segmentPressed,
            Platform.OS === 'web' && state.focused && styles.segmentFocused,
          ]}
        >
          <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
            {audioOnlyLabel}
          </Text>
        </Pressable>
      </View>
    );
  }
);

// Memoize to prevent re-renders when parent re-renders (e.g., totalPages change)
// Only re-render when labels or onToggle change
export const AudioFilterToggle = React.memo(AudioFilterToggleComponent, (prevProps, nextProps) => {
  return (
    prevProps.allStoriesLabel === nextProps.allStoriesLabel &&
    prevProps.audioOnlyLabel === nextProps.audioOnlyLabel &&
    prevProps.onToggle === nextProps.onToggle
    // Intentionally skip initialValue - it's only for initial useState
  );
});

AudioFilterToggle.displayName = 'AudioFilterToggle';

const styles = StyleSheet.create({
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borders.radius.md,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 180ms ease, box-shadow 180ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  segmentHovered: Platform.select({
    web: {
      backgroundColor: theme.colors.primary[50],
      boxShadow: `0 1px 6px ${hexAlpha(theme.colors.primary[900], 0.08)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  segmentPressed: {
    opacity: 0.9,
  },
  segmentFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  segmentText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.tertiary,
  },
  segmentTextActive: {
    color: theme.colors.interactive.primary,
  },
  toggleContainer: {
    padding: theme.spacing[1],
    borderRadius: theme.borders.radius.full,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'box-shadow 180ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  toggleContainerHovered: Platform.select({
    web: {
      boxShadow: `0 2px 10px ${hexAlpha(theme.colors.primary[900], 0.18)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  toggleContainerPressed: {
    opacity: 0.92,
  },
  toggleContainerFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: 3,
      borderRadius: 9999,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }),
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    padding: 2,
    ...Platform.select({
      web: {
        // @ts-ignore - CSS property for web
        transition: 'background-color 200ms ease-in-out',
      },
    }),
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.background.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    ...Platform.select({
      web: {
        // @ts-ignore - CSS property for web
        transition: 'transform 200ms ease-in-out',
      },
    }),
  },
});
