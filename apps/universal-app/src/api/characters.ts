import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CreateCharacterInput, 
  Character,
  PetAppearance,
  HumanAppearance,
  ImaginaryAppearance
} from '@wondertales/shared';
import apiClient from './client';

// Analysis Result (specific to character analysis endpoint)
interface AnalysisResult {
  description: string;
  petAppearance?: PetAppearance;
  humanAppearance?: HumanAppearance;
  imaginaryAppearance?: ImaginaryAppearance;
}

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

// Generate turnaround model sheet for imaginary character
export const useGenerateTurnaround = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { characterId: string; description?: string }) => {
      const response = await apiClient.post<{
        status: string;
        turnaroundSheet: { url: string; generatedAt: string };
      }>(`/api/v1/characters/${params.characterId}/turnaround`, {
        description: params.description,
      });
      return response.data.turnaroundSheet;
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
      photos: string[], 
      characterType: 'person' | 'animal' | 'imaginary',
      language?: string
    }) => {
      const response = await apiClient.post<{
        status: string;
        analysis: AnalysisResult;
      }>('/api/v1/characters/analyze', data);
      return response.data.analysis;
    }
  });
};
