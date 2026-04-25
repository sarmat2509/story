import React from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import type { 
  StoryRequestStatusResponse,
  StoryApi,
  StorySummaryApi,
  StoryManifestApi,
  StoryAudioMetadata,
  CreateStoryRequestInput,
  UserStoryLanguagesResponse,
} from '@wondertales/shared';
import apiClient from './client';

// Use shared types
export type Story = StoryApi;
export type StorySummary = StorySummaryApi;
export type CreateStoryRequest = CreateStoryRequestInput;

interface CreateStoryFromPhotosRequest {
  photos: string[];
  ageGroup: '2-3' | '4-5' | '6-7' | '8-9' | '10-12';
  scenario: string;
  language: string;
}

// List stories (summary view for library - lightweight payload)
export const useStories = (params: {
  limit?: number;
  offset?: number;
  hasAudio?: boolean;
  scenarioCardId?: string | null;
  seriesId?: string | null;
  language?: string | null;
} = {}) => {
  const { limit = 20, offset = 0, hasAudio, scenarioCardId, seriesId, language } = params ?? {};

  return useQuery({
    queryKey: ['stories', limit, offset, hasAudio, scenarioCardId, seriesId, language],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('limit', String(limit));
      searchParams.set('offset', String(offset));
      searchParams.set('view', 'summary');
      if (hasAudio === true) {
        searchParams.set('has_audio', 'true');
      }
      if (scenarioCardId) {
        searchParams.set('scenario_card_id', scenarioCardId);
      }
      if (seriesId) {
        searchParams.set('series_id', seriesId);
      }
      if (language) {
        searchParams.set('language', language);
      }
      const queryString = searchParams.toString();
      const url = queryString ? `/api/v1/me/stories?${queryString}` : '/api/v1/me/stories';
      const response = await apiClient.get<{ status: string; stories: StorySummary[]; pagination?: any }>(url);
      return {
        stories: response.data.stories,
        pagination: response.data.pagination ?? { limit, offset, total: response.data.stories?.length ?? 0 },
      };
    },
  });
};

/** Language codes that appear in the user's library (≥1 story each). */
export function useUserStoryLanguages() {
  return useQuery({
    queryKey: ['user-story-languages'],
    queryFn: async () => {
      const response = await apiClient.get<UserStoryLanguagesResponse>('/api/v1/me/stories/languages');
      return response.data.languages;
    },
  });
}

// List user's story series (for series list screen)
export interface SeriesListItem {
  id: string;
  baseTitle: string;
  totalParts: number;
  storyIds: string[];
  lastStories: Array<{
    id: string;
    coverImageUrl: string | null;
    coverThumbnailUrl: string | null;
  }>;
}

export function useSeriesList() {
  return useQuery({
    queryKey: ['series-list'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; series: SeriesListItem[] }>('/api/v1/me/series');
      return response.data.series;
    },
  });
}

// List stories in a series (for series detail screen)
export function useSeriesStories(seriesId: string | undefined) {
  return useStories({
    seriesId: seriesId ?? undefined,
    limit: 100,
    offset: 0,
  });
}

// Prefetch story data (fire-and-forget)
// Used to preload story before navigation for instant rendering
export const prefetchStory = (queryClient: QueryClient, storyId: string) => {
  return queryClient.prefetchQuery({
    queryKey: ['story', storyId],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; manifest: any }>(
        `/api/v1/stories/${storyId}/manifest`
      );
      return response.data.manifest;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Get story detail with scenes and assets (auth, owner only)
export const useStory = (id: string) => {
  return useQuery({
    queryKey: ['story', id],
    queryFn: async (): Promise<StoryManifestApi> => {
      const response = await apiClient.get<{ status: string; manifest: StoryManifestApi }>(
        `/api/v1/me/stories/${id}`
      );
      return response.data.manifest;
    },
    enabled: !!id,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/** Alias for useStory */
export const useMyStory = useStory;

/** Alias for useStories (list of current user's stories) */
export const useMyStories = useStories;

// Get lightweight generation status for polling (no scenes/assets)
export const useStoryGenerationStatus = (id: string) => {
  return useQuery({
    queryKey: ['story-generation-status', id],
    queryFn: async () => {
      const response = await apiClient.get<{ 
        status: string; 
        generationStatus: {
          storyId: string;
          imageGenerationComplete: boolean;
          sceneIdsWithImages: number[];
          failedScenes: Array<{ sceneId: number; errorMessage: string }>;
          scenesWithImages?: Array<{ sceneId: number; imageUrl: string }>; // NEW
        }
      }>(`/api/v1/stories/${id}/generation-status`);
      return response.data.generationStatus;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling if generation is complete
      if (!data || data.imageGenerationComplete) {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
    staleTime: 1000, // Keep fresh for only 1 second (we want real-time updates)
  });
};

// Get story status (for polling)
export const useStoryStatus = (requestId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['story-status', requestId],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; request: StoryRequestStatusResponse }>(
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

// Create story from photos (Instant Mode)
export const useCreateStoryFromPhotos = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateStoryFromPhotosRequest) => {
      const response = await apiClient.post<{ status: string; request: { id: string } }>(
        '/api/v1/stories/instant',
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
    onSuccess: (_data, variables) => {
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
        audioMetadata: StoryAudioMetadata | null;
        audioUrl: string | null;
        duration: number | null;
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
        audioUrl: response.data.audioUrl ?? null,
        duration: response.data.duration ?? null,
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
    onSuccess: (_data, variables) => {
      // Invalidate story query to refetch with alignment data
      queryClient.invalidateQueries({ queryKey: ['story', variables.storyId] });
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
      queryClient.invalidateQueries({ queryKey: ['user-story-languages'] });
    },
  });
};

// Schedule continuation for a story series
export function useScheduleStatus(storyId: string | undefined) {
  return useQuery({
    queryKey: ['story', storyId, 'schedule'],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: { cadence: string; nextRunAt: string; inProgress?: boolean } | { inProgress: true } | null;
      }>(`/api/v1/stories/${storyId}/schedule`);
      return response.data.data;
    },
    enabled: !!storyId,
  });
}

export function useScheduleContinuation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ storyId, cadence }: { storyId: string; cadence: 'daily' | 'every_2_days' | 'twice_weekly' | 'weekly' }) => {
      const response = await apiClient.post<{ status: string; data: { cadence: string; nextRunAt: string } }>(
        `/api/v1/stories/${storyId}/schedule-continuation`,
        { cadence }
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['story', variables.storyId, 'schedule'] });
    },
  });
}

export function useUnscheduleContinuation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (storyId: string) => {
      await apiClient.delete(`/api/v1/stories/${storyId}/schedule-continuation`);
    },
    onSuccess: (_, storyId) => {
      queryClient.invalidateQueries({ queryKey: ['story', storyId, 'schedule'] });
    },
  });
}

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
    onSuccess: (_data, storyId) => {
      // Invalidate story query to refresh UI
      queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });
}

// Publish or unpublish a story
export function usePublishStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      storyId,
      isPublished,
      visibility = 'public',
      shareCardSceneId,
    }: {
      storyId: string;
      isPublished: boolean;
      visibility?: 'public' | 'unlisted';
      shareCardSceneId?: number;
    }) => {
      const body: Record<string, unknown> = { isPublished, visibility };
      if (shareCardSceneId != null) body.shareCardSceneId = shareCardSceneId;
      const response = await apiClient.patch<{
        status: string;
        slug?: string;
        shareToken?: string;
        shareUrl?: string;
        message?: string;
        publishedStoriesCount?: number;
      }>(`/api/v1/stories/${storyId}`, body);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['story', variables.storyId] });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['published-stories'] });
    },
  });
}

/**
 * Submit story rating (1-5). Public or unlisted.
 * @param slugOrToken - published slug or share token
 * @param isUnlisted - true for unlisted (uses /api/v1/public/u/:token/rating)
 */
export async function submitStoryRating(
  slugOrToken: string,
  rating: number,
  voterId: string,
  isUnlisted: boolean
): Promise<void> {
  const url = isUnlisted
    ? `/api/v1/public/u/${slugOrToken}/rating`
    : `/api/v1/public/stories/${slugOrToken}/rating`;
  await apiClient.post(url, { rating, voterId });
}

// List published stories (public catalog)
export function usePublishedStories(params?: {
  limit?: number;
  offset?: number;
  hasAudio?: boolean;
  scenarioCardId?: string | null;
  language?: string | null;
  ageGroup?: string | null;
  readingTimeMin?: number;
  readingTimeMax?: number;
}) {
  const { limit = 20, offset = 0, hasAudio, scenarioCardId, language, ageGroup, readingTimeMin, readingTimeMax } = params ?? {};

  const searchParams: Record<string, string | number> = { limit, offset };
  if (hasAudio === true) searchParams.has_audio = 'true';
  if (scenarioCardId) searchParams.scenario_card_id = scenarioCardId;
  if (language) searchParams.language = language;
  if (ageGroup) searchParams.age_group = ageGroup;
  if (typeof readingTimeMin === 'number') searchParams.reading_time_min = readingTimeMin;
  if (typeof readingTimeMax === 'number') searchParams.reading_time_max = readingTimeMax;

  return useQuery({
    queryKey: ['published-stories', limit, offset, hasAudio, scenarioCardId, language, ageGroup, readingTimeMin, readingTimeMax],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        stories: any[];
        pagination: { limit: number; offset: number; total: number };
      }>('/api/v1/public/stories', { params: searchParams });
      return {
        stories: response.data.stories,
        pagination: response.data.pagination,
      };
    },
  });
}

export function usePublicAuthor(authorId: string | undefined, params?: { limit?: number; offset?: number }) {
  const { limit = 24, offset = 0 } = params ?? {};
  return useQuery({
    queryKey: ['public-author', authorId, limit, offset],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        author: {
          id: string;
          displayName: string;
          avatarUrl?: string | null;
          aboutMe?: string | null;
        };
        stories: any[];
        pagination: { limit: number; offset: number; total: number };
      }>(`/api/v1/public/authors/${authorId}`, { params: { limit, offset } });
      return response.data;
    },
    enabled: !!authorId,
  });
}

// Get published story by slug (public). On web, may use __INITIAL_STORY__ from SSR.
export function usePublicStory(slug: string | undefined, enabled = true) {
  const initialStoryRef = React.useRef<any>(null);
  if (
    typeof window !== 'undefined' &&
    slug &&
    (window as any).__INITIAL_STORY__ &&
    !initialStoryRef.current
  ) {
    initialStoryRef.current = (window as any).__INITIAL_STORY__;
    delete (window as any).__INITIAL_STORY__;
  }
  const hasInitialStory = !!initialStoryRef.current;

  const query = useQuery({
    queryKey: ['public-story', slug],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        story: any;
      }>(`/api/v1/public/stories/${slug}`);
      return response.data.story;
    },
    enabled: !!slug && enabled && !hasInitialStory,
  });

  if (hasInitialStory && slug) {
    return {
      ...query,
      data: initialStoryRef.current,
      isLoading: false,
      error: null,
      isFetching: false,
    };
  }
  return query;
}

/** @deprecated Use usePublicStory */
export const usePublishedStory = usePublicStory;

/**
 * Fetch public story by share token (unlisted). No __INITIAL_STORY__ (SSR uses different path).
 */
export function usePublicStoryByToken(token: string, enabled = true) {
  return useQuery({
    queryKey: ['public-story-token', token],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        story: any;
      }>(`/api/v1/public/u/${token}`);
      return response.data.story;
    },
    enabled: !!token && enabled,
  });
}

/**
 * Unified hook for story reader. Use slug for public, storyId for auth.
 * On web with slug, uses __INITIAL_STORY__ from SSR when available.
 */
export function useStoryForReader(slug?: string, storyId?: string) {
  const publicQuery = usePublicStory(slug, !!slug);
  const myStoryQuery = useStory(storyId ?? '');

  if (slug) {
    return { ...publicQuery, mode: 'public' as const };
  }
  return { ...myStoryQuery, mode: 'auth' as const };
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
          storyTitles: string[];
        } | null;
      }>(`/api/v1/stories/${storyId}/series`);
      return response.data.data;
    },
    enabled: !!storyId,
  });
}
