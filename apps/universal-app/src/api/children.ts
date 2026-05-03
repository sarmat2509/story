import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChildModeSettingsInput,
  ChildProfileApi,
  CreateChildProfileInput,
  UpdateChildModeControlsInput,
} from '@wondertales/shared';
import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { storage } from '@/utils/storage';

// Use shared type
type ChildProfile = ChildProfileApi;
type CreateChildProfileRequest = CreateChildProfileInput & {
  childDataConsentAccepted?: boolean;
};

export interface UseChildrenResult {
  children: ChildProfile[];
  limit: number | null;
  canCreateMore: boolean;
}

export interface ChildModeSettings extends Required<ChildModeSettingsInput> {}

export interface ChildModeControls {
  childModeEnabled: boolean;
  childModeSettings: ChildModeSettings;
  childModePasscodeConfigured: boolean;
  activeSessionCount: number;
}

export interface ChildModeSessionResponse {
  token: string;
  expiresAt: number;
  child: {
    id: string;
    name: string;
    referencePhotos?: Array<{ url: string }>;
    referencephotos?: Array<{ url: string }>;
    turnaroundSheet?: { url: string; frontUrl?: string; generatedAt?: string };
  };
  session: {
    id: string;
    mode: 'child';
    parentUserId: string | null;
    childProfileId: string | null;
    scopes: string[];
    expiresAt: string;
  };
  childMode: ChildModeControls;
}

// List child profiles
export const useChildren = () => {
  return useQuery({
    queryKey: ['children'],
    queryFn: async (): Promise<UseChildrenResult> => {
      const response = await apiClient.get<{
        status: string;
        children: ChildProfile[];
        limit: number | null;
        canCreateMore: boolean;
      }>('/api/v1/children');
      return {
        children: response.data.children,
        limit: response.data.limit,
        canCreateMore: response.data.canCreateMore,
      };
    },
  });
};

// Create child mutation
export const useCreateChild = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateChildProfileRequest) => {
      const response = await apiClient.post<{ status: string; child: ChildProfile }>(
        '/api/v1/children',
        data,
        { timeout: 120000 } // Turnaround generation can take ~40s+
      );
      return response.data.child;
    },
    onSuccess: () => {
      // Invalidate children list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
};

// Update child mutation
export const useUpdateChild = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateChildProfileInput> }) => {
      const response = await apiClient.patch<{ status: string; child: ChildProfile }>(
        `/api/v1/children/${id}`,
        data
      );
      return response.data.child;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
};

export const useChildModeControls = (childId?: string) => {
  return useQuery({
    queryKey: ['children', childId, 'child-mode'],
    enabled: Boolean(childId),
    queryFn: async (): Promise<ChildModeControls> => {
      const response = await apiClient.get<{ status: string; childMode: ChildModeControls }>(
        `/api/v1/children/${childId}/child-mode`
      );
      return response.data.childMode;
    },
  });
};

export const useUpdateChildModeControls = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateChildModeControlsInput }) => {
      const response = await apiClient.patch<{ status: string; childMode: ChildModeControls }>(
        `/api/v1/children/${id}/child-mode`,
        data
      );
      return response.data.childMode;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
      queryClient.invalidateQueries({ queryKey: ['children', variables.id, 'child-mode'] });
    },
  });
};

export const useEnterChildMode = () => {
  const queryClient = useQueryClient();
  const { enterChildSession } = useAuthStore();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<{ status: string } & ChildModeSessionResponse>(
        `/api/v1/children/${id}/child-mode/sessions`
      );
      return response.data;
    },
    onSuccess: async (result) => {
      await storage.setAuthToken(result.token);
      queryClient.clear();
      enterChildSession(result.token, {
        id: result.child.id,
        name: result.child.name,
        referencePhotos: result.child.referencePhotos ?? result.child.referencephotos,
        turnaroundSheet: result.child.turnaroundSheet,
        childMode: result.childMode,
      });
    },
  });
};

export const useRevokeChildModeSessions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<{ status: string; revokedCount: number }>(
        `/api/v1/children/${id}/child-mode/sessions`
      );
      return response.data.revokedCount;
    },
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
      queryClient.invalidateQueries({ queryKey: ['children', id, 'child-mode'] });
    },
  });
};

// Delete child mutation
export const useDeleteChild = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/children/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
};

// Analyze child photos mutation
interface AnalyzeChildRequest {
  photos: string[];
  language?: string;
}

interface ChildAnalysisResult {
  description: string;
  appearance?: {
    hairColor?: string;
    hairLength?: string;
    hairStyle?: string;
    eyeColor?: string;
    skinTone?: string;
    distinctiveFeatures?: string[];
  };
}

export const useAnalyzeChild = () => {
  return useMutation({
    mutationFn: async (data: AnalyzeChildRequest) => {
      const response = await apiClient.post<{ status: string; analysis: ChildAnalysisResult }>(
        '/api/v1/children/analyze',
        data
      );
      return response.data.analysis;
    },
  });
};
