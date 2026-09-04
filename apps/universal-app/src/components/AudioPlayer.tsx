import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { globalAudioService } from '@/services/globalAudioService';
import { audioPlaybackService } from '@/services/audioPlaybackService';
import { theme } from '@/theme';
import { PlayTriangleIcon } from '@/components/icons/PlayTriangleIcon';
import { PauseIcon } from '@/components/icons/PauseIcon';

interface AudioPlayerProps {
  storyId: string; // Story ID to determine if this player is connected to the active audio
  audioUrl: string;
  duration: number; // seconds
  title?: string;
  hasAlignment?: boolean; // Show highlight toggle if alignment data is available
  onHighlightToggle?: (enabled: boolean) => void; // Callback when toggle changes
  onPositionChange?: (position: number) => void; // Callback for position updates
  onFinish?: () => void; // Callback when audio playback finishes
  onActivate?: () => Promise<void>; // Called when play is pressed but this story is not the active one
}

export default function AudioPlayer({
  storyId,
  audioUrl: _audioUrl,
  duration,
  title,
  hasAlignment = false,
  onHighlightToggle,
  onPositionChange,
  onFinish,
  onActivate,
}: AudioPlayerProps) {
  const { t } = useTranslation();

  // Read from global store
  const activeStoryId = useAudioPlayerStore((s) => s.activeStoryId);
  const storeIsPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const storePosition = useAudioPlayerStore((s) => s.position);
  const storeIsLoading = useAudioPlayerStore((s) => s.isLoading);
  const storeIsLoaded = useAudioPlayerStore((s) => s.isLoaded);
  const storeIsHighlightEnabled = useAudioPlayerStore((s) => s.isHighlightEnabled);
  const storePlaybackRate = useAudioPlayerStore((s) => s.playbackRate);
  const didJustFinish = useAudioPlayerStore((s) => s.didJustFinish);

  // Determine if this player is connected to the currently active audio
  const isConnected = storyId === activeStoryId;

  // When connected, use store state. When disconnected, use defaults.
  const isPlaying = isConnected ? storeIsPlaying : false;
  const position = isConnected ? storePosition : 0;
  const isLoading = isConnected ? storeIsLoading : false;
  const isLoaded = isConnected ? storeIsLoaded : true; // Show as ready when disconnected
  const isHighlightEnabled = isConnected ? storeIsHighlightEnabled : false;
  const playbackRate = storePlaybackRate;

  // Playback rate constants
  const RATE_MIN = 0.75;
  const RATE_MAX = 1.25;
  const RATE_STEP = 0.05;

  // Local UI state (not related to audio playback)
  const [isDragging, setIsDragging] = useState(false);
  const rateSliderRef = useRef<View>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progressBarRef = useRef<View>(null);

  // Validate duration prop
  const validDuration = isFinite(duration) && duration > 0 ? duration : 0;

  // Hydrate playback rate from AsyncStorage on mount
  useEffect(() => {
    audioPlaybackService.getPlaybackRate().then((rate) => {
      useAudioPlayerStore.getState().setPlaybackRate(rate);
    });
  }, []);

  // Subscribe to position updates for parent callback (throttled to ~10/sec to avoid re-render storms)
  useEffect(() => {
    if (!onPositionChange || !isConnected) return;
    let lastCall = 0;
    const throttleMs = 100;
    const unsub = useAudioPlayerStore.subscribe((state) => {
      if (state.activeStoryId !== storyId) return;
      const now = Date.now();
      if (now - lastCall < throttleMs) return;
      lastCall = now;
      onPositionChange(state.position);
    });
    return unsub;
  }, [onPositionChange, isConnected, storyId]);

  // Handle finish event (only when connected)
  useEffect(() => {
    if (didJustFinish && isConnected) {
      onFinish?.();
      useAudioPlayerStore.getState().setDidJustFinish(false);
    }
  }, [didJustFinish, onFinish, isConnected]);

  // Sync highlight toggle to store and notify parent
  const handleToggleHighlight = useCallback(
    (value: boolean) => {
      console.log('[AudioPlayer] Toggle highlight:', value);
      useAudioPlayerStore.getState().toggleHighlight(value);
      onHighlightToggle?.(value);

      // Immediately send current position when enabling highlight
      if (value && onPositionChange) {
        const currentPos = useAudioPlayerStore.getState().position;
        if (currentPos > 0) {
          console.log('[AudioPlayer] Sending initial position:', currentPos);
          onPositionChange(currentPos);
        }
      }
    },
    [onHighlightToggle, onPositionChange]
  );

  const togglePlayPause = async () => {
    console.log('[AudioPlayer] togglePlayPause called:', { isConnected, isLoaded, isPlaying });

    if (!isConnected) {
      // Story is not the active one - need to activate it first
      if (onActivate) {
        console.log('[AudioPlayer] Activating story via onActivate callback');
        try {
          await onActivate();
        } catch (err) {
          console.error('[AudioPlayer] Activation error:', err);
          setError('Помилка відтворення');
        }
      }
      return;
    }

    if (!isLoaded) return;
    try {
      await globalAudioService.togglePlayPause();
    } catch (err) {
      console.error('[AudioPlayer] Playback error:', err);
      setError('Помилка відтворення');
    }
  };

  const roundToStep = (value: number) => {
    const steps = Math.round((value - RATE_MIN) / RATE_STEP);
    return Math.max(RATE_MIN, Math.min(RATE_MAX, RATE_MIN + steps * RATE_STEP));
  };

  const handleRateSliderPress = useCallback(async (event: any) => {
    const nativeEvent = event.nativeEvent;
    let tapX: number | undefined;
    if (typeof nativeEvent.locationX === 'number') tapX = nativeEvent.locationX;
    else if (typeof nativeEvent.offsetX === 'number') tapX = nativeEvent.offsetX;
    if (typeof tapX !== 'number' || !isFinite(tapX)) return;

    rateSliderRef.current?.measure((_x, _y, width) => {
      if (!width || width <= 0) return;
      const ratio = Math.max(0, Math.min(1, tapX! / width));
      const rawRate = RATE_MIN + ratio * (RATE_MAX - RATE_MIN);
      const rate = roundToStep(rawRate);
      globalAudioService.setPlaybackRate(rate);
    });
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = async (event: any) => {
    // Don't seek on click if user was dragging
    if (hasDragged) {
      setHasDragged(false);
      return;
    }

    if (!isConnected || !isLoaded) {
      console.log('Cannot seek: audio not ready or not connected');
      return;
    }

    try {
      const nativeEvent = event.nativeEvent;
      let tapX: number | undefined;

      if (typeof nativeEvent.locationX === 'number') {
        tapX = nativeEvent.locationX;
      } else if (typeof nativeEvent.offsetX === 'number') {
        tapX = nativeEvent.offsetX;
      } else if (typeof nativeEvent.pageX === 'number' && progressBarRef.current) {
        progressBarRef.current.measure((_x, _y, width, _height, pageX, _pageY) => {
          const calculatedTapX = nativeEvent.pageX - pageX;
          performSeek(calculatedTapX, width);
        });
        return;
      }

      if (typeof tapX !== 'number' || !isFinite(tapX)) {
        console.warn('Could not determine tap position:', { nativeEvent });
        return;
      }

      progressBarRef.current?.measure((_x, _y, width) => {
        performSeek(tapX!, width);
      });
    } catch (err) {
      console.error('Seek handler error:', err);
    }
  };

  const performSeek = (tapX: number, width: number, isDrag: boolean = false) => {
    if (!isConnected || !isLoaded) return;

    if (!width || width <= 0 || !isFinite(width)) {
      console.warn('Invalid progress bar width:', width);
      return;
    }

    const percentage = Math.max(0, Math.min(1, tapX / width));
    const newPositionSeconds = percentage * validDuration;
    const newPositionMs = newPositionSeconds * 1000;

    if (!isFinite(newPositionMs) || newPositionMs < 0) {
      console.warn('Invalid seek position:', {
        tapX,
        width,
        percentage,
        newPositionMs,
        duration: validDuration,
      });
      return;
    }

    // Update drag position for immediate visual feedback
    if (isDrag) {
      setDragPosition(newPositionSeconds);
      setHasDragged(true);
    }

    // Seek via global service
    globalAudioService.seekTo(newPositionMs).catch((err) => {
      console.error('Seek error:', err);
    });
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setTimeout(() => {
      setDragPosition(null);
    }, 50);
  };

  const handleDragMove = (event: any) => {
    if (!isDragging || !isConnected || !isLoaded) return;

    const nativeEvent = event.nativeEvent;
    let tapX: number | undefined;

    if (typeof nativeEvent.locationX === 'number') {
      tapX = nativeEvent.locationX;
    } else if (typeof nativeEvent.offsetX === 'number') {
      tapX = nativeEvent.offsetX;
    }

    if (typeof tapX !== 'number' || !isFinite(tapX)) return;

    progressBarRef.current?.measure((_x, _y, width) => {
      performSeek(tapX!, width);
    });
  };

  // Web-specific mouse event handlers
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isDragging || !progressBarRef.current) return;

      const element = progressBarRef.current as unknown as HTMLElement;
      const rect = element.getBoundingClientRect?.();

      if (rect) {
        const tapX = e.clientX - rect.left;
        performSeek(tapX, rect.width, true);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setTimeout(() => {
        setDragPosition(null);
      }, 50);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, isLoaded, validDuration]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}

      {/* Play/Pause Button */}
      <TouchableOpacity
        style={[styles.playButton, (isLoading || !isLoaded) && styles.playButtonDisabled]}
        onPress={togglePlayPause}
        disabled={isLoading || !isLoaded}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : isPlaying ? (
          <PauseIcon size={28} color="#FFFFFF" />
        ) : (
          <View style={styles.playTriangleOptical}>
            <PlayTriangleIcon size={30} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.timeText}>
          {formatTime(dragPosition !== null ? dragPosition : position)}
        </Text>
        <View style={styles.progressBarWrapper}>
          <Pressable
            ref={progressBarRef}
            style={({ pressed }) => [
              styles.progressBarTouchable,
              pressed && styles.progressBarPressed,
            ]}
            onPress={handleSeek}
            onPressIn={handleDragStart}
            onPressOut={handleDragEnd}
            onResponderMove={handleDragMove}
            disabled={!isLoaded}
          >
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      validDuration > 0
                        ? ((dragPosition !== null ? dragPosition : position) / validDuration) * 100
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
            {/* Slider Thumb */}
            {isLoaded && validDuration > 0 && (
              <View
                style={[
                  styles.progressThumb,
                  {
                    left: `${((dragPosition !== null ? dragPosition : position) / validDuration) * 100}%`,
                  },
                  isDragging && styles.progressThumbDragging,
                ]}
              />
            )}
          </Pressable>
        </View>
        <Text style={styles.timeText}>{formatTime(validDuration)}</Text>
      </View>

      {/* Playback speed slider (0.75–1.25) */}
      <View style={styles.speedSection}>
        <Text style={styles.speedSectionTitle}>{t('story_viewer.playback_speed')}</Text>
        <View style={styles.speedContainer}>
          <MaterialCommunityIcons
            name="snail"
            size={22}
            color={theme.colors.text.tertiary}
            style={styles.speedIcon}
          />
          <Pressable ref={rateSliderRef} style={styles.speedTrack} onPress={handleRateSliderPress}>
            <View style={styles.speedTrackBg} />
            <View
              style={[
                styles.speedThumb,
                {
                  left: `${((playbackRate - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 100}%`,
                },
              ]}
            />
          </Pressable>
          <MaterialCommunityIcons
            name="run-fast"
            size={22}
            color={theme.colors.text.tertiary}
            style={styles.speedIcon}
          />
        </View>
      </View>

      {/* Highlight Toggle (M6) - Show only if alignment data is available */}
      {hasAlignment && (
        <View style={styles.highlightToggleContainer}>
          <View style={styles.toggleRow}>
            <Switch
              value={isHighlightEnabled}
              onValueChange={handleToggleHighlight}
              trackColor={{
                false: theme.colors.border.medium,
                true: theme.colors.interactive.primary,
              }}
              thumbColor={theme.colors.background.primary}
              disabled={!isLoaded}
            />
            <Text style={styles.toggleLabel}>{t('story_viewer.highlight_toggle')}</Text>
          </View>
          <Text style={styles.toggleDescription}>
            {t('story_viewer.highlight_toggle_description')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: 0,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.spacing[3],
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[5],
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.interactive.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing[4],
  },
  playButtonDisabled: {
    opacity: 0.5,
  },
  /** Play triangle reads left-heavy; nudge right for optical center in the circle. */
  playTriangleOptical: {
    marginLeft: 5,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  progressBarWrapper: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  progressBarTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  progressBarPressed: {
    opacity: 0.8,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: theme.colors.border.light,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: 3,
  },
  progressThumb: {
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.interactive.primary,
    borderWidth: 2,
    borderColor: theme.colors.background.primary,
    marginLeft: -8,
    marginTop: -8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    cursor: 'pointer',
  },
  progressThumbDragging: {
    transform: [{ scale: 1.2 }],
    shadowOpacity: 0.4,
  },
  timeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    minWidth: 40,
  },
  speedSection: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
  },
  speedSectionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[3],
  },
  speedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  speedIcon: {
    width: 28,
  },
  speedTrack: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  speedTrackBg: {
    height: 6,
    backgroundColor: theme.colors.border.light,
    borderRadius: 3,
  },
  speedThumb: {
    position: 'absolute',
    top: '50%',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.interactive.primary,
    borderWidth: 2,
    borderColor: theme.colors.background.primary,
    marginLeft: -9,
    marginTop: -9,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  errorText: {
    color: theme.colors.status.error,
    textAlign: 'center',
  },
  highlightToggleContainer: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: theme.borders.width.thin,
    borderTopColor: theme.colors.border.light,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
  },
  toggleLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  toggleDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginTop: theme.spacing[2],
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.sm,
  },
});
