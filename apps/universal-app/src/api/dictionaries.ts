import { useQuery } from '@tanstack/react-query';
import { 
  StoryGoalApi, 
  ScenarioCardApi 
} from '@wondertales/shared';
import apiClient from './client';
import i18n from '@/config/i18n';

// Use shared types
type StoryGoal = StoryGoalApi;
type ScenarioCard = ScenarioCardApi;

// Get story themes (goals, scenarios)
export const useStoryThemes = () => {
  const locale = i18n.language || 'uk';
  
  return useQuery({
    queryKey: ['dictionaries', 'story-themes', locale],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          goals: StoryGoal[];
          scenarioCards: ScenarioCard[];
        };
      }>(`/api/v1/dictionaries/story-themes?locale=${locale}`);
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
