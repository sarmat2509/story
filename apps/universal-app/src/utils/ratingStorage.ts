/**
 * Rating storage - voter_id and rated stories for story rating widget.
 * Uses AsyncStorage (localStorage on web).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const VOTER_ID_KEY = '@wondertales/wt_voter_id';
const RATED_STORIES_KEY = '@wondertales/wt_rated_stories';

function generateVoterId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const ratingStorage = {
  async getOrCreateVoterId(): Promise<string> {
    try {
      const existing = await AsyncStorage.getItem(VOTER_ID_KEY);
      if (existing) return existing;
      const id = generateVoterId();
      await AsyncStorage.setItem(VOTER_ID_KEY, id);
      return id;
    } catch {
      return generateVoterId();
    }
  },

  async getRatedStories(): Promise<Set<string>> {
    try {
      const data = await AsyncStorage.getItem(RATED_STORIES_KEY);
      if (!data) return new Set();
      const arr = JSON.parse(data) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  },

  async addRatedStory(storyId: string): Promise<void> {
    try {
      const set = await this.getRatedStories();
      set.add(storyId);
      await AsyncStorage.setItem(RATED_STORIES_KEY, JSON.stringify([...set]));
    } catch {
      // Ignore storage errors
    }
  },
};
