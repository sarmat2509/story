import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
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
  initialValue?: boolean;
  onToggle: (newValue: boolean) => void;
}

interface SegmentLayout {
  x: number;
  width: number;
}

type SegmentLayouts = Record<'all' | 'audio', SegmentLayout | null>;

export interface AudioFilterToggleRef {
  setValue: (value: boolean) => void;
}

const AudioFilterToggleComponent = forwardRef<AudioFilterToggleRef, Props>(
  ({ allStoriesLabel, audioOnlyLabel, initialValue = false, onToggle }, ref) => {
    const [audioOnly, setAudioOnly] = useState(() => initialValue);
    const [segmentLayouts, setSegmentLayouts] = useState<SegmentLayouts>({
      all: null,
      audio: null,
    });
    const bubbleLeft = useRef(new Animated.Value(0)).current;
    const bubbleWidth = useRef(new Animated.Value(0)).current;
    const hasPositionedBubble = useRef(false);

    useImperativeHandle(ref, () => ({
      setValue: (value: boolean) => {
        setAudioOnly(value);
      },
    }));

    useEffect(() => {
      const target = audioOnly ? segmentLayouts.audio : segmentLayouts.all;
      if (!target) return;

      if (!hasPositionedBubble.current) {
        bubbleLeft.setValue(target.x);
        bubbleWidth.setValue(target.width);
        hasPositionedBubble.current = true;
        return;
      }

      Animated.parallel([
        Animated.timing(bubbleLeft, {
          toValue: target.x,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(bubbleWidth, {
          toValue: target.width,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    }, [audioOnly, bubbleLeft, bubbleWidth, segmentLayouts]);

    const recordSegmentLayout = useCallback(
      (segment: keyof SegmentLayouts, event: LayoutChangeEvent) => {
        const { x, width } = event.nativeEvent.layout;
        setSegmentLayouts((current) => {
          const previous = current[segment];
          if (previous?.x === x && previous.width === width) {
            return current;
          }
          return { ...current, [segment]: { x, width } };
        });
      },
      []
    );

    const selectSegment = useCallback(
      (nextAudioOnly: boolean) => {
        if (nextAudioOnly === audioOnly) return;
        setAudioOnly(nextAudioOnly);
        onToggle(nextAudioOnly);
      },
      [audioOnly, onToggle]
    );

    const renderSegment = (
      value: boolean,
      label: string,
      segment: keyof SegmentLayouts,
      testID: string
    ) => {
      const selected = audioOnly === value;
      return (
        <Pressable
          onPress={() => selectSegment(value)}
          onLayout={(event) => recordSegmentLayout(segment, event)}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ selected }}
          testID={testID}
          focusable
          style={(state: ExtendedPressableState) => [
            styles.segment,
            Platform.OS === 'web' && state.hovered && !selected && styles.segmentHovered,
            state.pressed && styles.segmentPressed,
            Platform.OS === 'web' && state.focused && styles.segmentFocused,
          ]}
        >
          <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{label}</Text>
        </Pressable>
      );
    };

    return (
      <View
        style={styles.segmentedControl}
        accessibilityRole="radiogroup"
        testID="catalog-audio-toggle"
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeBubble,
            {
              left: bubbleLeft,
              width: bubbleWidth,
            },
          ]}
          testID="catalog-audio-active-bubble"
        />
        {renderSegment(false, allStoriesLabel, 'all', 'catalog-audio-all')}
        {renderSegment(true, audioOnlyLabel, 'audio', 'catalog-audio-only')}
      </View>
    );
  }
);

export const AudioFilterToggle = React.memo(AudioFilterToggleComponent, (prevProps, nextProps) => {
  return (
    prevProps.allStoriesLabel === nextProps.allStoriesLabel &&
    prevProps.audioOnlyLabel === nextProps.audioOnlyLabel &&
    prevProps.onToggle === nextProps.onToggle
  );
});

AudioFilterToggle.displayName = 'AudioFilterToggle';

const styles = StyleSheet.create({
  segmentedControl: {
    position: 'relative',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 3,
    overflow: 'hidden',
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.primary[200],
    backgroundColor: theme.colors.background.secondary,
  },
  activeBubble: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: theme.borders.radius.full,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.primary[300],
    backgroundColor: theme.colors.primary[50],
    shadowColor: theme.colors.primary[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
  segment: {
    zIndex: 1,
    minHeight: 40,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borders.radius.full,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 160ms ease, opacity 160ms ease',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
  },
  segmentHovered: Platform.select({
    web: {
      backgroundColor: hexAlpha(theme.colors.primary[500], 0.06),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  segmentPressed: {
    opacity: 0.82,
  },
  segmentFocused: Platform.select({
    web: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: theme.colors.primary[500],
      outlineOffset: -2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    default: {},
  }),
  segmentText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: theme.colors.interactive.primary,
  },
});
