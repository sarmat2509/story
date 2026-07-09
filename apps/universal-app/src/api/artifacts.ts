import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export interface StoryArtifactApi {
  id: string;
  artifactCode: string;
  title: string;
  description: string;
  imagePath: string;
  fullImagePath: string;
  fullImageUrl: string;
  thumbnailPath: string;
  thumbnailUrl: string;
  imageUrl: string;
  semanticTags?: string[];
}

export interface CollectedStoryArtifactApi {
  id: string;
  userId: string;
  childProfileId: string | null;
  artifactId: string;
  storyId: string;
  acquiredLabel: string | null;
  acquiredAt: string;
  artifact: StoryArtifactApi;
  story: {
    id: string;
    title: string;
    language: string;
    createdAt: string;
  };
}

export function useCollectedArtifacts(params: { childProfileId?: string; locale?: string } = {}) {
  return useQuery({
    queryKey: ['collected-artifacts', params.childProfileId ?? null, params.locale ?? null],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.childProfileId) {
        searchParams.set('child_profile_id', params.childProfileId);
      }
      if (params.locale) {
        searchParams.set('locale', params.locale.slice(0, 2));
      }
      const queryString = searchParams.toString();
      const response = await apiClient.get<{
        status: string;
        artifacts: CollectedStoryArtifactApi[];
      }>(`/api/v1/me/artifacts${queryString ? `?${queryString}` : ''}`);
      return response.data.artifacts;
    },
  });
}

export function useCollectStoryArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      storyId: string;
      artifactId?: string;
      childProfileId?: string;
      locale?: string;
    }) => {
      const response = await apiClient.post<{
        status: string;
        artifact: CollectedStoryArtifactApi;
        alreadyCollected: boolean;
      }>('/api/v1/me/artifacts/collect', data);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collected-artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['story', variables.storyId] });
    },
  });
}
