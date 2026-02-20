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

// Lightweight story summary for library grid
export interface StorySummary {
  id: string;
  title: string;
  language: string;
  status: string;
  coverImageUrl: string | null;
  hasAudio: boolean;
  scenarioCardId: string | null;
  createdAt: string;
}

// List stories (summary view for library - lightweight payload)
export const useStories = (params?: { limit?: number; offset?: number; hasAudio?: boolean; scenarioCardId?: string | null } = {}) => {
  const { limit = 20, offset = 0, hasAudio, scenarioCardId } = params;
  
  return useQuery({
    queryKey: ['stories', limit, offset, hasAudio, scenarioCardId],
    queryFn: async () => {
      const queryParams: Record<string, any> = { limit, offset, has_audio: hasAudio, view: 'summary' };
      if (scenarioCardId) {
        queryParams.scenario_card_id = scenarioCardId;
      }
      const response = await apiClient.get<{ status: string; stories: StorySummary[]; pagination: any }>(
        '/api/v1/stories',
        { params: queryParams }
      );
      return {
        stories: response.data.stories,
        pagination: response.data.pagination,
      };
    },
  });
};

// Get story detail with scenes and assets
// Polls every 3s when image generation is incomplete
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
    refetchInterval: (query) => (query.state.data?.imageGenerationComplete === false ? 3000 : false),
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
    refetchInterval: (query) => {
      const data = query.state.data;
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

// Retry image generation only (for failed requests where text succeeded)
export const useRetryStoryImages = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiClient.post<{ status: string; request: { id: string; status: string } }>(
        `/api/v1/stories/requests/${requestId}/retry-images`
      );
      return response.data;
    },
    onSuccess: (_, requestId) => {
      queryClient.invalidateQueries({ queryKey: ['story-status', requestId] });
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

// Poll audio status (lightweight - only checks audioMetadata + job status + queue info)
// Note: cache sync moved to StoryViewerScreen useEffect (onSuccess removed in TanStack Query v5)
export const useAudioStatus = (storyId: string, enabled: boolean = false) => {
  return useQuery({
    queryKey: ['audio-status', storyId],
    queryFn: async () => {
      const response = await apiClient.get<{ 
        status: string; 
        audioMetadata: any | null;
        jobStatus: 'queued' | 'processing' | null;
        queuePosition: number | null;
        estimatedWaitMs: number | null;
        processingStartedAt: number | null;
        estimatedProcessingMs: number | null;
        activeJobsCount: number;
        maxConcurrency: number;
      }>(`/api/v1/stories/${storyId}/audio-status`);
      return {
        audioMetadata: response.data.audioMetadata,
        jobStatus: response.data.jobStatus,
        queuePosition: response.data.queuePosition ?? null,
        estimatedWaitMs: response.data.estimatedWaitMs ?? null,
        processingStartedAt: response.data.processingStartedAt ?? null,
        estimatedProcessingMs: response.data.estimatedProcessingMs ?? null,
        activeJobsCount: response.data.activeJobsCount ?? 0,
        maxConcurrency: response.data.maxConcurrency ?? 0,
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
