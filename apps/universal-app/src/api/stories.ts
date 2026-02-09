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
  progressData?: {
    activeTasks: Array<{ task: string; progress: number; details?: any }>;
    completedTasks: string[];
    overallProgress: number;
  };
  storyId?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
}

interface CreateStoryRequest {
  childProfileId?: string;
  uiLocale: string;
  storyLanguage: string;
  goal?: string;
  tone?: string;
  imageStyle?: string;
  selectedCharacters?: string[];
  selectedChildren?: string[]; // NEW: Selected child profiles to include in story
  userNotes?: string;
  scenarioCardId?: string;
}

// List stories
export const useStories = (params?: { limit?: number; offset?: number; hasAudio?: boolean } = {}) => {
  const { limit = 20, offset = 0, hasAudio } = params;
  
  return useQuery({
    queryKey: ['stories', limit, offset, hasAudio],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; stories: Story[]; pagination: any }>(
        '/api/v1/stories',
        { params: { limit, offset, has_audio: hasAudio } }
      );
      return {
        stories: response.data.stories,
        pagination: response.data.pagination,
      };
    },
  });
};

// Get story detail with scenes and assets
export const useStory = (id: string) => {
  return useQuery({
    queryKey: ['story', id],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; manifest: any }>(
        `/api/v1/stories/${id}/manifest`
      );
      return response.data.manifest;
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

// Generate audio for story
export const useGenerateAudio = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      storyId, 
      voiceId, 
      speed, 
      nightMode 
    }: {
      storyId: string;
      voiceId?: string;
      speed?: number;
      nightMode?: boolean;
    }) => {
      const response = await apiClient.post(`/api/v1/stories/${storyId}/audio`, {
        voiceId,
        speed,
        nightMode
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate story query to refetch with audio metadata
      queryClient.invalidateQueries({ queryKey: ['story', variables.storyId] });
    },
  });
};

// Poll audio status (lightweight - only checks audioMetadata + job status)
// Note: cache sync moved to StoryViewerScreen useEffect (onSuccess removed in TanStack Query v5)
export const useAudioStatus = (storyId: string, enabled: boolean = false) => {
  return useQuery({
    queryKey: ['audio-status', storyId],
    queryFn: async () => {
      const response = await apiClient.get<{ 
        status: string; 
        audioMetadata: any | null;
        jobStatus: 'queued' | 'processing' | null;
      }>(`/api/v1/stories/${storyId}/audio-status`);
      return {
        audioMetadata: response.data.audioMetadata,
        jobStatus: response.data.jobStatus
      };
    },
    enabled: enabled && !!storyId,
    refetchInterval: enabled ? 3000 : false, // Poll every 3s when enabled
  });
};

// Get audio URL for playback
export const useAudioUrl = (storyId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['audio-url', storyId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/v1/stories/${storyId}/audio`);
      return response.data.data; // { audioUrl, duration, voice, metadata }
    },
    enabled: enabled && !!storyId,
    staleTime: 1000 * 60 * 60, // 1 hour (audio URLs are stable)
  });
};

// Generate forced alignment for story audio
export const useGenerateAlignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ storyId }: { storyId: string }) => {
      const response = await apiClient.post(`/api/v1/stories/${storyId}/alignment`);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate story query to refetch with alignment data
      queryClient.invalidateQueries({ queryKey: ['story', variables.storyId] });
    },
  });
};

// Get audio usage stats for current user
export const useAudioUsage = () => {
  return useQuery({
    queryKey: ['audio-usage'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/stories/audio-usage');
      return response.data.data;
    },
  });
};

// Delete story
export const useDeleteStory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (storyId: string) => {
      await apiClient.delete(`/api/v1/stories/${storyId}`);
    },
    onSuccess: () => {
      // Invalidate stories list to refresh after deletion
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
};

// Generate continuation for a story
export function useGenerateContinuation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (storyId: string) => {
      const response = await apiClient.post<{
        status: string;
        request: {
          id: string;
          status: string;
          progress: number;
          createdAt: string;
        };
      }>(`/api/v1/stories/${storyId}/continue`);
      return response.data.request; // Return just the request object with id
    },
    onSuccess: (data, storyId) => {
      // Invalidate story query to refresh UI
      queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });
}

// Get series info for a story
export function useSeriesInfo(storyId: string) {
  return useQuery({
    queryKey: ['series-info', storyId],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          seriesId: string;
          baseTitle: string;
          totalParts: number;
          partNumber: number;
          storyIds: string[];
        } | null;
      }>(`/api/v1/stories/${storyId}/series`);
      return response.data.data;
    },
    enabled: !!storyId,
  });
}
