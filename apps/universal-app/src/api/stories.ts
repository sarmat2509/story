import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import apiClient from './client';

interface Story {
  id: string;
  title: string;
  description: string | null;
  language: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  createdAt: string;
  scenes: any[];
}

interface StoryStatus {
  status: string;
  progress: number;
  currentPhase: string;
  activeTasks: any[];
}

interface CreateStoryRequest {
  childProfileId?: string;
  uiLocale: string;
  storyLanguage: string;
  goal?: string;
  tone?: string;
  includeFamily?: boolean;
  selectedCharacters?: string[];
  userNotes?: string;
}

// List stories
export const useStories = () => {
  return useQuery({
    queryKey: ['stories'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; stories: Story[] }>(
        '/api/v1/stories'
      );
      return response.data.stories;
    },
  });
};

// Get story detail
export const useStory = (id: string) => {
  return useQuery({
    queryKey: ['story', id],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; story: Story }>(
        `/api/v1/stories/${id}`
      );
      return response.data.story;
    },
    enabled: !!id,
  });
};

// Get story status (for polling)
export const useStoryStatus = (requestId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['story-status', requestId],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; request: StoryStatus }>(
        `/api/v1/stories/requests/${requestId}/status`
      );
      return response.data.request;
    },
    enabled: enabled && !!requestId,
    refetchInterval: (data) => {
      // Stop polling if completed or failed
      if (!data) return 2000;
      if (data.status === 'completed' || data.status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });
};

// Create story
export const useCreateStory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateStoryRequest) => {
      const response = await apiClient.post<{ status: string; request: { id: string } }>(
        '/api/v1/stories',
        data
      );
      return response.data.request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
};

// Delete story
export const useDeleteStory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/stories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
};
