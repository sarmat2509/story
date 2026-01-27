import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  AUTH_TOKEN: '@kazka/auth_token',
  USER: '@kazka/user',
  LANGUAGE: '@kazka/language',
  WIZARD_STATE: '@kazka/wizard_state',
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
};
