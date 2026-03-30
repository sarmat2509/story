import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

export type AdminStoryListItem = {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  role: 'user' | 'admin';
  planSlug: string | null;
  planName: string | null;
  createdAt: string;
};

export type AdminFeedbackListItem = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  category: 'bug' | 'feature' | 'other' | string;
  message: string;
  email: string | null;
  screenshotUrl: string | null;
  context: {
    platform: string | null;
    userAgent: string | null;
    url: string | null;
    reportedScreen: string | null;
  };
  createdAt: string;
};

export type AdminImageValidationItem = {
  id: string;
  storyId: string;
  sceneIndex: number;
  attempt: number;
  imageStoragePath: string;
  imageUrl: string;
  validationScore: number;
  visionModel: string | null;
  result: unknown;
  createdAt: string;
};

export type AdminImageValidationDetail = AdminImageValidationItem;

export type AdminDirectorSceneItem = {
  id: string;
  storyId: string;
  sceneIndex: number;
  storyText: string;
  environmentId: string | null;
  characterOutfitIds: Record<string, string> | null;
  sceneVisual: unknown;
  illustrationBlockIndex: number;
  isBlockAnchor: boolean;
  createdAt: string;
};

export type AdminStorySceneItem = {
  sceneIndex: number;
  storyText: string;
};

export type AdminStoryValidationItem = {
  id: string;
  storyId: string;
  sceneIndex: number;
  attempt: number;
  imageStoragePath: string;
  imageUrl: string;
  validationScore: number;
  visionModel: string | null;
  result: unknown;
  createdAt: string;
};

export type AdminStoryCostBreakdownItem = {
  provider: string;
  operation: string;
  model: string | null;
  costUsd: number;
};

export type AdminStoryCacheStats = {
  totalCachedInputUnits: number;
  totalEffectiveInputUnits: number;
  cacheHitCount: number;
  cachedOperationCount: number;
};

export type AdminEnvironmentItem = {
  id: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
};

export type AdminOutfitItem = {
  id: string;
  characterName?: string;
  description?: string;
  imageUrl?: string | null;
};

export type AdminContentConfigResource =
  | 'plans'
  | 'features'
  | 'planFeatures'
  | 'translations'
  | 'storyGoals'
  | 'contentPolicyRules'
  | 'ageEngineRules'
  | 'scenarioCards'
  | 'scenarioPlotExamples'
  | 'scenarioWorldRules';

export type AdminContentConfigItem = Record<string, unknown>;

type PaginatedResponse<T> = {
  status: string;
  data: {
    items: T[];
    meta: {
      limit?: number;
      offset?: number;
      total: number;
    };
  };
};

export function useAdminStories(params: { limit: number; offset: number; search?: string }) {
  const { limit, offset, search } = params;
  return useQuery({
    queryKey: ['admin', 'stories', limit, offset, search ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminStoryListItem>>('/api/v1/admin/stories', {
        params: { limit, offset, search: search || undefined },
      });
      return response.data.data;
    },
  });
}

export function useAdminUsers(params: { limit: number; offset: number; search?: string }) {
  const { limit, offset, search } = params;
  return useQuery({
    queryKey: ['admin', 'users', limit, offset, search ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminUserListItem>>('/api/v1/admin/users', {
        params: { limit, offset, search: search || undefined },
      });
      return response.data.data;
    },
  });
}

export function useAdminFeedback(params: {
  limit: number;
  offset: number;
  search?: string;
  category?: 'bug' | 'feature' | 'other';
  hasScreenshot?: boolean;
}) {
  const { limit, offset, search, category, hasScreenshot } = params;
  return useQuery({
    queryKey: ['admin', 'feedback', limit, offset, search ?? '', category ?? '', hasScreenshot ?? false],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminFeedbackListItem>>('/api/v1/admin/feedback', {
        params: {
          limit,
          offset,
          search: search || undefined,
          category: category || undefined,
          hasScreenshot: hasScreenshot || undefined,
        },
      });
      return response.data.data;
    },
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      role?: 'user' | 'admin';
      planSlug?: string;
    }) => {
      const response = await apiClient.patch<{ status: string; data: { id: string; email: string; role: 'user' | 'admin' } }>(
        `/api/v1/admin/users/${params.userId}`,
        {
          role: params.role,
          planSlug: params.planSlug,
        },
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminImageValidations(params: { limit: number; offset: number }) {
  const { limit, offset } = params;
  return useQuery({
    queryKey: ['admin', 'image-validations', limit, offset],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<AdminImageValidationItem>>('/api/v1/admin/image-validations', {
        params: { limit, offset },
      });
      return response.data.data;
    },
  });
}

export function useAdminImageValidation(id?: string) {
  return useQuery({
    queryKey: ['admin', 'image-validation', id ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: AdminImageValidationDetail }>(
        `/api/v1/admin/image-validations/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useAdminRegenerateSceneImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      storyId: string;
      sceneId: number;
      visualPrompt?: string;
    }) => {
      const response = await apiClient.post<{
        status: string;
        message: string;
        data: {
          jobId: string;
          storyId: string;
          sceneId: number;
        };
      }>(`/api/v1/admin/stories/${params.storyId}/scenes/${params.sceneId}/regenerate-image`, {
        visualPrompt: params.visualPrompt,
      });
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validations'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'image-validation'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'director-scenes', variables.storyId] });
    },
  });
}

export function useAdminDirectorScenes(storyId?: string) {
  return useQuery({
    queryKey: ['admin', 'director-scenes', storyId ?? ''],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          story: {
            id: string;
            title: string;
            createdAt: string;
          };
          storyScenes: AdminStorySceneItem[];
          items: AdminDirectorSceneItem[];
          validations: AdminStoryValidationItem[];
          cost: {
            costUsd: number;
            cacheStats: AdminStoryCacheStats;
            breakdown: AdminStoryCostBreakdownItem[];
          };
          environments: AdminEnvironmentItem[];
          outfits: AdminOutfitItem[];
          meta: { total: number };
        };
      }>(`/api/v1/admin/stories/${storyId}/director-scenes`);
      return response.data.data;
    },
    enabled: !!storyId,
  });
}

export function useAdminContentConfig(resource: AdminContentConfigResource) {
  return useQuery({
    queryKey: ['admin', 'content-config', resource],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        data: {
          resource: AdminContentConfigResource;
          items: AdminContentConfigItem[];
          meta: { total: number };
        };
      }>(`/api/v1/admin/content-config/${resource}`);
      return response.data.data;
    },
  });
}

export function useUpdateAdminContentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      resource: AdminContentConfigResource;
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const response = await apiClient.patch<{ status: string; data: AdminContentConfigItem }>(
        `/api/v1/admin/content-config/${params.resource}/${params.id}`,
        params.patch,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-config', variables.resource] });
    },
  });
}

export function useCreateAdminContentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      resource: AdminContentConfigResource;
      payload: Record<string, unknown>;
    }) => {
      const response = await apiClient.post<{ status: string; data: AdminContentConfigItem }>(
        `/api/v1/admin/content-config/${params.resource}`,
        params.payload,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-config', variables.resource] });
    },
  });
}

export function useDeleteAdminContentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      resource: AdminContentConfigResource;
      id: string;
    }) => {
      const response = await apiClient.delete<{ status: string; data: { deleted: boolean } }>(
        `/api/v1/admin/content-config/${params.resource}/${params.id}`,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-config', variables.resource] });
    },
  });
}
