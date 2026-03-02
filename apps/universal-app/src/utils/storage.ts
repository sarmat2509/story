import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  AUTH_TOKEN: '@wondertales/auth_token',
  USER: '@wondertales/user',
  LANGUAGE: '@wondertales/language',
  WIZARD_STATE: '@wondertales/wizard_state',
  AUDIO_NOTIFICATIONS: '@wondertales/audio_notifications_shown',
  LIBRARY_VIEW_MODE: '@wondertales/library_view_mode',
  AUDIO_FILTER: '@wondertales/audio_filter',
} as const;

export const storage = {
  async getItem(key: keyof typeof STORAGE_KEYS): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return null;
    }
  },

  async setItem(key: keyof typeof STORAGE_KEYS, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS[key], value);
    } catch (error) {
      console.error(`Error setting ${key} in storage:`, error);
    }
  },

  async removeItem(key: keyof typeof STORAGE_KEYS): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`Error removing ${key} from storage:`, error);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  },

  // Typed helpers
  async getAuthToken(): Promise<string | null> {
    return this.getItem('AUTH_TOKEN');
  },

  async setAuthToken(token: string): Promise<void> {
    return this.setItem('AUTH_TOKEN', token);
  },

  async removeAuthToken(): Promise<void> {
    return this.removeItem('AUTH_TOKEN');
  },

  async getUser(): Promise<any | null> {
    const data = await this.getItem('USER');
    return data ? JSON.parse(data) : null;
  },

  async setUser(user: any): Promise<void> {
    return this.setItem('USER', JSON.stringify(user));
  },

  async getLanguage(): Promise<string | null> {
    return this.getItem('LANGUAGE');
  },

  async setLanguage(language: string): Promise<void> {
    return this.setItem('LANGUAGE', language);
  },

  async getLibraryViewMode(): Promise<'grid' | 'list' | null> {
    const data = await this.getItem('LIBRARY_VIEW_MODE');
    return (data as 'grid' | 'list') || null;
  },

  async setLibraryViewMode(mode: 'grid' | 'list'): Promise<void> {
    return this.setItem('LIBRARY_VIEW_MODE', mode);
  },

  async getAudioFilter(): Promise<boolean | null> {
    try {
      const value = await this.getItem('AUDIO_FILTER');
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },

  async setAudioFilter(filter: boolean): Promise<void> {
    try {
      return this.setItem('AUDIO_FILTER', JSON.stringify(filter));
    } catch (error) {
      console.error('Failed to save audio filter:', error);
    }
  },
};
