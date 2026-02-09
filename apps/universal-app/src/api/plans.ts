import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

interface PlanFeature {
  name: string;
  value: any;
  category: string;
}

interface PlanBase {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceMonthly: number;
  pricingCurrency: string;
  sortOrder: number;
  features: Record<string, PlanFeature>;
}

interface PlanPublic extends PlanBase {}

interface PlanAuthenticated extends PlanBase {
  isCurrent: boolean;
}

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
    },
  });
};
