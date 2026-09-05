import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContext } from '@react-navigation/native';
import { useAudioPlayerStore } from '@/store/audioPlayerStore';
import { globalAudioService } from '@/services/globalAudioService';
import { navigateToStory } from '@/navigation/navigationRef';
import { theme } from '@/theme';

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

  // Hide if no active story or if the full player is already visible on screen
  if (!activeStoryId || fullPlayerStoryId === activeStoryId) return null;

  return <MiniAudioPlayerInner activeStoryId={activeStoryId} />;
}

/**
 * Inner component rendered only when the mini player should be visible.
 * Separated so that useNavigation is only called when needed and
 * store selectors above can short-circuit rendering early.
 */
function MiniAudioPlayerInner({ activeStoryId }: { activeStoryId: string }) {
  const navContext = useContext(NavigationContext);

  const storyTitle = useAudioPlayerStore((s) => s.storyTitle);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const isLoading = useAudioPlayerStore((s) => s.isLoading);
  const position = useAudioPlayerStore((s) => s.position);
  const duration = useAudioPlayerStore((s) => s.duration);

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  const handlePlayPause = () => {
    globalAudioService.togglePlayPause();
  };

  return (
    <View style={styles.container}>
      {/* Thin progress bar at the top */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>

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

        {/* Go to story button (only when navigation context is available) */}
        {navContext && <GoToStoryButton activeStoryId={activeStoryId} />}
      </View>
    </View>
  );
}

/**
 * Separate component for the navigate-to-story button so that
 * useNavigation is only called inside a valid NavigationContext.
 */
function GoToStoryButton({ activeStoryId }: { activeStoryId: string }) {
  return (
    <TouchableOpacity style={styles.goButton} onPress={() => navigateToStory(activeStoryId)}>
      <Ionicons name="chevron-up-outline" size={22} color={theme.colors.text.inverse} />
    </TouchableOpacity>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.interactive.primary,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.text.inverse,
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
  goButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
