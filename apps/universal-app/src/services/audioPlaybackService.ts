import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = '@wondertales/audio_playback';
const HIGHLIGHT_KEY = '@wondertales/highlight_enabled';
const PLAYBACK_RATE_KEY = '@wondertales/playback_rate';
const STATE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AudioPlaybackState {
  position: number; // seconds (with millisecond precision, e.g., 45.234)
  isHighlightEnabled: boolean; // kept for backward compat but no longer used per-story
  timestamp: number; // when last updated (Date.now())
}

export const audioPlaybackService = {
  /**
   * Save audio playback state for a story
   * @param storyId - Story UUID
   * @param state - Playback state (position with millisecond precision, highlight toggle)
   */
  async saveState(storyId: string, state: Omit<AudioPlaybackState, 'timestamp'>): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}/${storyId}`;
      const stateWithTimestamp: AudioPlaybackState = {
        ...state,
        timestamp: Date.now(),
      };
      
      console.log('[AudioPlaybackService] Saving state:', { storyId, position: state.position.toFixed(3), isHighlightEnabled: state.isHighlightEnabled });
      
      await AsyncStorage.setItem(key, JSON.stringify(stateWithTimestamp));
    } catch (error) {
      console.error('Error saving audio playback state:', error);
    }
  },
  
  /**
   * Get audio playback state for a story
   * @param storyId - Story UUID
   * @returns Promise<AudioPlaybackState | null> - null if no state, expired, or error
   */
  async getState(storyId: string): Promise<AudioPlaybackState | null> {
    try {
      const key = `${STORAGE_KEY_PREFIX}/${storyId}`;
      const data = await AsyncStorage.getItem(key);
      
      if (!data) {
        return null;
      }
      
      const state: AudioPlaybackState = JSON.parse(data);
      
      // Check if state is expired (older than 24h)
      const age = Date.now() - state.timestamp;
      if (age > STATE_EXPIRY_MS) {
        // Auto-cleanup expired state
        await this.clearState(storyId);
        return null;
      }
      
      console.log('[AudioPlaybackService] Loaded state:', { storyId, position: state.position.toFixed(3), isHighlightEnabled: state.isHighlightEnabled });
      
      return state;
    } catch (error) {
      console.error('Error getting audio playback state:', error);
      return null;
    }
  },
  
  /**
   * Clear audio playback state for a story
   * @param storyId - Story UUID
   */
  async clearState(storyId: string): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}/${storyId}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error clearing audio playback state:', error);
    }
  },
  
  /**
   * Clear all expired states (older than 24h)
   * Useful for cleanup on app start
   */
  async clearOldStates(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const playbackKeys = allKeys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
      
      for (const key of playbackKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const state: AudioPlaybackState = JSON.parse(data);
          const age = Date.now() - state.timestamp;
          
          if (age > STATE_EXPIRY_MS) {
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Error clearing old audio playback states:', error);
    }
  },

  /**
   * Save global "read together" highlight toggle (applies to all stories)
   */
  async saveHighlightEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(enabled));
    } catch (error) {
      console.error('Error saving highlight state:', error);
    }
  },

  /**
   * Get global "read together" highlight toggle
   * @returns boolean (defaults to false if not set)
   */
  async getHighlightEnabled(): Promise<boolean> {
    try {
      const data = await AsyncStorage.getItem(HIGHLIGHT_KEY);
      return data ? JSON.parse(data) : false;
    } catch (error) {
      console.error('Error getting highlight state:', error);
      return false;
    }
  },

  /**
   * Save global playback rate (0.75–1.25)
   */
  async savePlaybackRate(rate: number): Promise<void> {
    try {
      const clamped = Math.max(0.75, Math.min(1.25, rate));
      await AsyncStorage.setItem(PLAYBACK_RATE_KEY, JSON.stringify(clamped));
    } catch (error) {
      console.error('Error saving playback rate:', error);
    }
  },

  /**
   * Get global playback rate
   * @returns number (defaults to 1.0 if not set)
   */
  async getPlaybackRate(): Promise<number> {
    try {
      const data = await AsyncStorage.getItem(PLAYBACK_RATE_KEY);
      if (!data) return 1;
      const rate = JSON.parse(data);
      return typeof rate === 'number' && rate >= 0.75 && rate <= 1.25 ? rate : 1;
    } catch (error) {
      console.error('Error getting playback rate:', error);
      return 1;
    }
  },
};
