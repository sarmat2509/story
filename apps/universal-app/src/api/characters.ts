import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreateCharacterInput,
  Character,
  PetAppearance,
  HumanAppearance,
  ImaginaryAppearance,
} from '@wondertales/shared';
import apiClient from './client';

// Analysis Result (specific to character analysis endpoint)
interface AnalysisResult {
  description: string;
  petAppearance?: PetAppearance;
  humanAppearance?: HumanAppearance;
  imaginaryAppearance?: ImaginaryAppearance;
}

export interface CharacterGenerationUsage {
  used: number;
  limit: number;
  remaining: number;
  planLimit?: number;
  bundleBonus?: number;
}

type EntitlementFeatureUsage = {
  used?: number;
  limit?: number;
  remaining?: number;
  plan_limit?: number;
  bundle_bonus?: number;
};

// Get all characters for the current user
export const useCharacters = () => {
  return useQuery({
    queryKey: ['characters'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; characters: Character[] }>(
        '/api/v1/characters'
      );
      return response.data.characters;
    },
  });
};

export const useCharacterGenerationUsage = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['entitlements', 'characters_per_month'],
    queryFn: async (): Promise<CharacterGenerationUsage | null> => {
      const response = await apiClient.get<{
        status: string;
        features?: Record<string, EntitlementFeatureUsage>;
      }>('/api/v1/entitlements', { skipAuthLogoutOn401: true });
      const feature = response.data.features?.characters_per_month;
      if (!feature || typeof feature.limit !== 'number') {
        return null;
      }

      return {
        used: feature.used ?? 0,
        limit: feature.limit,
        remaining: feature.remaining ?? Math.max(0, feature.limit - (feature.used ?? 0)),
        planLimit: feature.plan_limit,
        bundleBonus: feature.bundle_bonus,
      };
    },
    enabled,
  });
};

// Create character mutation
export const useCreateCharacter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCharacterInput) => {
      const response = await apiClient.post<{ status: string; character: Character }>(
        '/api/v1/characters',
        data
      );
      return response.data.character;
    },
    onSuccess: () => {
      // Invalidate characters list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });
};

// Update character mutation
export const useUpdateCharacter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateCharacterInput> }) => {
      const response = await apiClient.patch<{ status: string; character: Character }>(
        `/api/v1/characters/${id}`,
        data
      );
      return response.data.character;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
      queryClient.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });
};

export const useRenameCharacter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiClient.patch<{ status: string; character: Character }>(
        `/api/v1/characters/${id}/name`,
        { name }
      );
      return response.data.character;
    },
    onSuccess: (character) => {
      queryClient.setQueryData<Character[]>(['characters'], (current) =>
        current?.map((item) => (item.id === character.id ? character : item))
      );
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
};

// Delete character mutation
export const useDeleteCharacter = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/characters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
};

// Analyze character photos mutation
export const useAnalyzeCharacter = () => {
  return useMutation({
    mutationFn: async (data: {
      photos: string[];
      characterType: 'person' | 'animal' | 'imaginary';
      language?: string;
    }) => {
      const response = await apiClient.post<{
        status: string;
        analysis: AnalysisResult;
      }>('/api/v1/characters/analyze', data);
      return response.data.analysis;
    },
  });
};
