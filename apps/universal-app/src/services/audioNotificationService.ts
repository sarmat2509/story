import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@wondertales/audio_notifications_shown';

interface AudioNotificationState {
  [storyId: string]: boolean;
}

export const audioNotificationService = {
  /**
   * Check if notification was shown for story
   * @param storyId - Story UUID
   * @returns Promise<boolean> - true if notification was already shown
   */
  async wasShown(storyId: string): Promise<boolean> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) {
        return false;
      }
      
      const state: AudioNotificationState = JSON.parse(data);
      return state[storyId] === true;
    } catch (error) {
      console.error('Error checking audio notification state:', error);
      return false;
    }
  },
  
  /**
   * Mark notification as shown for story
   * @param storyId - Story UUID
   */
  async markAsShown(storyId: string): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      const state: AudioNotificationState = data ? JSON.parse(data) : {};
      
      state[storyId] = true;
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error marking audio notification as shown:', error);
    }
  },
  
  /**
   * Clear all shown notifications (useful for testing)
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing audio notifications:', error);
    }
  },
};
