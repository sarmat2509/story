import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { globalAudioService } from '@/services/globalAudioService';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';

const isTouchDevice =
  Platform.OS !== 'web' ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

/**
 * Thin bottom bar (Spotify-style) showing the currently playing story audio.
 * Hidden when:
 *  - No story is active in the global audio player
 *  - The active story's full-size player is actually visible.
 *    Tablet uses a collapsible sheet, so merely viewing the story is not enough
 *    to hide this player.
 */
export function MiniAudioPlayer() {
  const activeStoryId = useAudioPlayerStore((s) => s.activeStoryId);
  const fullPlayerStoryId = useAudioPlayerStore((s) => s.fullPlayerStoryId);
  const viewingStoryId = useAudioPlayerStore((s) => s.viewingStoryId);
  const hasStartedPlayback = useAudioPlayerStore((s) => s.hasStartedPlayback);

  if (!activeStoryId) return null;

  const isViewingActiveStory = viewingStoryId === activeStoryId;
  const isFullPlayerOpenForActiveStory = fullPlayerStoryId === activeStoryId;

  // For the story being read now, show the compact player only while its full
  // player is closed and narration is playing. Audio from another story stays
  // available here regardless of the current story panel's state.
  if (isViewingActiveStory && (isFullPlayerOpenForActiveStory || !hasStartedPlayback)) return null;

  return (
    <MiniAudioPlayerInner
      activeStoryId={activeStoryId}
      showOpenStoryAction={Boolean(viewingStoryId && viewingStoryId !== activeStoryId)}
    />
  );
}

/**
 * Inner component rendered only when the mini player should be visible.
 */
function MiniAudioPlayerInner({
  activeStoryId,
  showOpenStoryAction,
}: {
  activeStoryId: string;
  showOpenStoryAction: boolean;
}) {
  const { t } = useTranslation();
  const entrance = useRef(new Animated.Value(0)).current;

  const storyTitle = useAudioPlayerStore((s) => s.storyTitle);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const isLoading = useAudioPlayerStore((s) => s.isLoading);
  const isLoaded = useAudioPlayerStore((s) => s.isLoaded);
  const position = useAudioPlayerStore((s) => s.position);
  const duration = useAudioPlayerStore((s) => s.duration);
  const [isDragging, setIsDragging] = useState(false);
  const [isProgressHovered, setIsProgressHovered] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const progressBarRef = useRef<View>(null);

  const validDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const displayPosition = dragPosition ?? position;
  const progressPercent = validDuration > 0 ? (displayPosition / validDuration) * 100 : 0;
  const shouldShowProgressThumb = isTouchDevice || isProgressHovered || isDragging;

  useEffect(() => {
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);

  const handlePlayPause = () => {
    globalAudioService.togglePlayPause();
  };

  // Keep mini-player seeking consistent with AudioPlayer: taps seek immediately
  // and a drag continuously updates both the thumb and the shared audio service.
  const performSeek = useCallback(
    (tapX: number, width: number, isDrag = false) => {
      if (!isLoaded || !width || width <= 0 || !Number.isFinite(width)) return;

      const percentage = Math.max(0, Math.min(1, tapX / width));
      const newPositionSeconds = percentage * validDuration;
      if (!Number.isFinite(newPositionSeconds) || newPositionSeconds < 0) return;

      if (isDrag) {
        setDragPosition(newPositionSeconds);
        setHasDragged(true);
      }

      globalAudioService.seekTo(newPositionSeconds * 1000).catch((error) => {
        console.error('[MiniAudioPlayer] Seek error:', error);
      });
    },
    [isLoaded, validDuration]
  );

  const handleSeek = useCallback(
    (event: any) => {
      if (hasDragged) {
        setHasDragged(false);
        return;
      }
      if (!isLoaded) return;

      const nativeEvent = event.nativeEvent;
      const tapX =
        typeof nativeEvent.locationX === 'number'
          ? nativeEvent.locationX
          : typeof nativeEvent.offsetX === 'number'
            ? nativeEvent.offsetX
            : undefined;

      if (typeof tapX === 'number' && Number.isFinite(tapX)) {
        progressBarRef.current?.measure((_x, _y, width) => performSeek(tapX, width));
        return;
      }

      if (typeof nativeEvent.pageX === 'number') {
        progressBarRef.current?.measure((_x, _y, width, _height, pageX) => {
          performSeek(nativeEvent.pageX - pageX, width);
        });
      }
    },
    [hasDragged, isLoaded, performSeek]
  );

  const handleDragMove = useCallback(
    (event: any) => {
      if (!isDragging || !isLoaded) return;
      const nativeEvent = event.nativeEvent;
      const tapX =
        typeof nativeEvent.locationX === 'number'
          ? nativeEvent.locationX
          : typeof nativeEvent.offsetX === 'number'
            ? nativeEvent.offsetX
            : undefined;
      if (typeof tapX !== 'number' || !Number.isFinite(tapX)) return;
      progressBarRef.current?.measure((_x, _y, width) => performSeek(tapX, width, true));
    },
    [isDragging, isLoaded, performSeek]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setTimeout(() => setDragPosition(null), 50);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !isDragging || !progressBarRef.current) return;

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const element = progressBarRef.current as unknown as HTMLElement;
      const rect = element.getBoundingClientRect?.();
      if (rect) performSeek(event.clientX - rect.left, rect.width, true);
    };
    const handleMouseUp = () => handleDragEnd();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleDragEnd, isDragging, performSeek]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [72, 0] }),
            },
          ],
        },
      ]}
    >
      <View style={styles.surface}>
        <View style={styles.content}>
          {/* Play / Pause button */}
          <TouchableOpacity style={styles.playButton} onPress={handlePlayPause} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.text.inverse} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color={theme.colors.text.inverse}
              />
            )}
          </TouchableOpacity>

          {/* Story title */}
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {storyTitle || 'Story'}
            </Text>
            <Text style={styles.time}>
              {formatTime(position)} / {formatTime(duration)}
            </Text>
          </View>

          {showOpenStoryAction && (
            <TouchableOpacity
              style={styles.openStoryButton}
              onPress={() => navigateToStory(activeStoryId)}
              accessibilityRole="button"
            >
              <Text style={styles.openStoryButtonText}>{t('artifacts.open_story')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Pressable
        ref={progressBarRef}
        style={({ pressed }) => [styles.progressBarTouchable, pressed && styles.progressBarPressed]}
        onPress={handleSeek}
        onPressIn={() => setIsDragging(true)}
        onPressOut={handleDragEnd}
        onResponderMove={handleDragMove}
        onHoverIn={() => setIsProgressHovered(true)}
        onHoverOut={() => setIsProgressHovered(false)}
        disabled={!isLoaded || validDuration <= 0}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: validDuration, now: displayPosition }}
      >
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        {isLoaded && validDuration > 0 && shouldShowProgressThumb && (
          <View
            style={[
              styles.progressThumb,
              { left: `${progressPercent}%` },
              isDragging && styles.progressThumbDragging,
            ]}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    // Reserve invisible space above the panel so the seek hit target and
    // hover-only thumb can extend over the visual top edge without overlap.
    paddingTop: 14,
    overflow: 'visible',
  },
  surface: {
    backgroundColor: theme.colors.interactive.primary,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  progressBarTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    justifyContent: 'center',
    zIndex: 1,
  },
  progressBarPressed: {
    opacity: 0.8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.text.inverse,
  },
  progressThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.text.inverse,
    borderWidth: 2,
    borderColor: theme.colors.interactive.primary,
    marginLeft: -7,
    marginTop: -7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  progressThumbDragging: {
    transform: [{ scale: 1.2 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[3],
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  time: {
    fontSize: theme.typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 1,
  },
  openStoryButton: {
    minHeight: 36,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  openStoryButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
});
