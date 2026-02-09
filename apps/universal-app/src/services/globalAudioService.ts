import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAudioPlayerStore, PlayParams } from '@/store/audioPlayerStore';
import { audioPlaybackService } from './audioPlaybackService';

/**
 * Singleton service that manages the expo-av Sound instance globally.
 * Both AudioPlayer (full) and MiniAudioPlayer (compact) delegate to this service.
 * State is synchronized with the Zustand audioPlayerStore.
 */
class GlobalAudioService {
  private sound: Audio.Sound | null = null;
  private currentAudioUrl: string | null = null;
  private isConfigured = false;
  private lastSaveTime = 0;
  private saveIntervalMs = 5000; // Save position every 5 seconds

  /**
   * Configure audio mode (call once on app start or before first play)
   */
  private async configureAudioMode(): Promise<void> {
    if (this.isConfigured) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      this.isConfigured = true;
    } catch (err) {
      console.error('[GlobalAudioService] Failed to configure audio mode:', err);
    }
  }

  /**
   * Load audio and optionally start playback.
   * Unloads any previously loaded sound first (single-story rule).
   */
  async loadAndPlay(params: PlayParams): Promise<void> {
    await this.configureAudioMode();

    // Save and unload old sound BEFORE changing store state.
    // This prevents old sound's callbacks from writing stale position
    // into the new story's state during the async gap.
    const store = useAudioPlayerStore.getState();
    if (store.activeStoryId) {
      await audioPlaybackService.clearState(store.activeStoryId);
    }
    await this.unloadCurrent();

    // Now safe to update store — old sound callbacks can no longer fire
    store.play(params);

    try {
      console.log('[GlobalAudioService] Loading audio:', params.audioUrl);

      const { sound, status } = await Audio.Sound.createAsync(
        { uri: params.audioUrl },
        { shouldPlay: false },
        this.onPlaybackStatusUpdate
      );

      this.sound = sound;
      this.currentAudioUrl = params.audioUrl;

      if (status.isLoaded) {
        const updatedStore = useAudioPlayerStore.getState();
        updatedStore.setIsLoaded(true);
        updatedStore.setIsLoading(false);

        // Seek to initial position if provided (resume playback)
        if (params.initialPosition && params.initialPosition > 0) {
          console.log('[GlobalAudioService] Seeking to initial position:', params.initialPosition.toFixed(3) + 's');
          await sound.setPositionAsync(params.initialPosition * 1000);
        }

        // Auto-play if requested
        if (params.autoPlay !== false) {
          await sound.playAsync();
        }
      } else {
        console.error('[GlobalAudioService] Audio created but not loaded');
        const updatedStore = useAudioPlayerStore.getState();
        updatedStore.setIsLoading(false);
      }
    } catch (err) {
      console.error('[GlobalAudioService] Failed to load audio:', err);
      const updatedStore = useAudioPlayerStore.getState();
      updatedStore.setIsLoading(false);
      updatedStore.setIsLoaded(false);
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.sound) return;
    try {
      await this.sound.pauseAsync();
      // Save position immediately on pause
      const store = useAudioPlayerStore.getState();
      if (store.activeStoryId) {
        await audioPlaybackService.saveState(store.activeStoryId, {
          position: store.position,
          isHighlightEnabled: false, // highlight is saved globally, not per-story
        });
      }
    } catch (err) {
      console.error('[GlobalAudioService] Pause error:', err);
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (!this.sound) return;
    try {
      await this.sound.playAsync();
    } catch (err) {
      console.error('[GlobalAudioService] Resume error:', err);
    }
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause(): Promise<void> {
    const store = useAudioPlayerStore.getState();
    if (store.isPlaying) {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  /**
   * Seek to a specific position (in milliseconds)
   */
  async seekTo(positionMs: number): Promise<void> {
    if (!this.sound) return;
    try {
      if (!isFinite(positionMs) || positionMs < 0) {
        console.warn('[GlobalAudioService] Invalid seek position:', positionMs);
        return;
      }
      await this.sound.setPositionAsync(positionMs);
    } catch (err) {
      console.error('[GlobalAudioService] Seek error:', err);
    }
  }

  /**
   * Stop playback and clear state
   */
  async stop(): Promise<void> {
    // Save final position before stopping
    const store = useAudioPlayerStore.getState();
    if (store.activeStoryId && store.position > 0) {
      await audioPlaybackService.saveState(store.activeStoryId, {
        position: store.position,
        isHighlightEnabled: false, // highlight is saved globally, not per-story
      });
    }

    await this.unloadCurrent();
    store.stop();
  }

  /**
   * Check if a specific story is currently the active audio
   */
  isActiveStory(storyId: string): boolean {
    return useAudioPlayerStore.getState().activeStoryId === storyId;
  }

  /**
   * Get the current Sound instance (for advanced use cases)
   */
  getSound(): Audio.Sound | null {
    return this.sound;
  }

  /**
   * Unload current sound without clearing store
   */
  private async unloadCurrent(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch (err) {
        console.error('[GlobalAudioService] Unload error:', err);
      }
      this.sound = null;
      this.currentAudioUrl = null;
    }
  }

  /**
   * Playback status update callback from expo-av
   */
  private onPlaybackStatusUpdate = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) return;

    const store = useAudioPlayerStore.getState();
    const positionSeconds = status.positionMillis / 1000;

    store.updatePosition(positionSeconds);
    store.setIsPlaying(status.isPlaying);

    // Periodically save position to AsyncStorage
    const now = Date.now();
    if (store.activeStoryId && now - this.lastSaveTime > this.saveIntervalMs) {
      this.lastSaveTime = now;
      audioPlaybackService.saveState(store.activeStoryId, {
        position: positionSeconds,
        isHighlightEnabled: false, // highlight is saved globally, not per-story
      });
    }

    // Handle playback finish
    if (status.didJustFinish) {
      store.setIsPlaying(false);
      store.setDidJustFinish(true);

      // Clear saved position since playback completed
      if (store.activeStoryId) {
        audioPlaybackService.clearState(store.activeStoryId);
      }

      // Unload sound and fully reset store (clears activeStoryId, mini player disappears)
      this.unloadCurrent().then(() => {
        useAudioPlayerStore.getState().stop();
      });
    }
  };
}

// Export singleton instance
export const globalAudioService = new GlobalAudioService();
