import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  PlanFeatureDenormalizedApi,
  PlanPublicApi,
  PlanAuthenticatedApi 
} from '@wondertales/shared';
import apiClient from './client';

// Use shared types - renamed for clarity
type PlanFeature = PlanFeatureDenormalizedApi;
type PlanPublic = PlanPublicApi;
type PlanAuthenticated = PlanAuthenticatedApi;

// Get plans with features (public, works for all users)
export const usePlans = () => {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; plans: PlanPublic[] }>(
        '/api/v1/plans'
      );
      return response.data.plans;
    },
  });
};

export interface SubscriptionUsageData {
  stories: { used: number; limit: number; remaining: number };
  audio: { used: number; limit: number; remaining: number };
  resetsAt: string;
}

export const useSubscriptionUsage = () => {
  return useQuery({
    queryKey: ['subscription-usage'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: SubscriptionUsageData }>(
        '/api/v1/me/subscription-usage'
      );
      return response.data.data;
    },
  });
};

// Get plans with current plan info (authenticated only)
export const usePlansWithAuth = () => {
  return useQuery({
    queryKey: ['plans', 'with-auth'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; plans: PlanAuthenticated[] }>(
        '/api/v1/plans/with-features'
      );
      return response.data.plans;
    },
  });
};

// Upgrade plan (test mode, no payment)
export const useUpgradePlan = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (planSlug: string) => {
      const response = await apiClient.put<{
        status: string;
        message: string;
        subscription: any;
        plan: any;
      }>('/api/v1/plans/upgrade', { planSlug });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate plans cache to refetch with new current plan
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plans', 'with-auth'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
    },
  });
};
