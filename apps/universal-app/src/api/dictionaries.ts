import { useQuery } from '@tanstack/react-query';
import apiClient from './client';

interface StoryGoal {
  slug: string;
  name: string;
  description: string;
  minAge: number;
}

interface StoryTone {
  slug: string;
  name: string;
  description: string;
}

interface ScenarioCard {
  id: string;
  name: string;
  description: string;
  icon?: string;
  suggestedGoals: string[];
  ageGroups: string[];
}

// Get story themes (goals, tones, scenarios)
export const useStoryThemes = () => {
  return useQuery({
    queryKey: ['dictionaries', 'story-themes'],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          goals: StoryGoal[];
          tones: StoryTone[];
          scenarioCards: ScenarioCard[];
        };
      }>('/api/v1/dictionaries/story-themes');
      return response.data.data;
    },
    staleTime: Infinity, // Never refetch automatically
  });
};

// Character traits (type-specific)
export const useCharacterTraits = (type: string) => {
  return useQuery({
    queryKey: ['dictionaries', 'character-traits', type],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        dictionaries: any;
      }>(`/api/v1/dictionaries/character-traits?type=${type}`);
      return response.data.dictionaries;
    },
    staleTime: Infinity,
    enabled: !!type,
  });
};
