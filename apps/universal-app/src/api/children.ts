import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateChildProfileInput, ChildProfileApi } from '@wondertales/shared';
import apiClient from './client';

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
