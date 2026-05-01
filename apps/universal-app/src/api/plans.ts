import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlanPublicApi,
  PlanAuthenticatedApi,
  type StoryBundleListItemApi,
} from '@wondertales/shared';
import { APP_CONFIG } from '@/config/constants';
import apiClient from './client';
import i18n from '@/config/i18n';

// Use shared types - renamed for clarity
type PlanPublic = PlanPublicApi;
type PlanAuthenticated = PlanAuthenticatedApi;

// Get plans with features (public, works for all users)
export const usePlans = () => {
  const locale = i18n.language || APP_CONFIG.defaultLanguage;

  return useQuery({
    queryKey: ['plans', locale],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; plans: PlanPublic[] }>(
        '/api/v1/plans',
        { params: { locale } }
      );
      return response.data.plans;
    },
  });
};

export interface SubscriptionUsageData {
  stories: {
    used: number;
    limit: number;
    remaining: number;
    planLimit?: number;
    bundleBonus?: number;
  };
  audio: {
    used: number;
    limit: number;
    remaining: number;
    planLimit?: number;
    bundleBonus?: number;
  };
  resetsAt: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  paymentProvider?: string | null;
  enableRealPayments?: boolean;
}

export const useSubscriptionUsage = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['subscription-usage'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: SubscriptionUsageData }>(
        '/api/v1/me/subscription-usage'
      );
      return response.data.data;
    },
    enabled,
  });
};

// Get plans with current plan info (authenticated only)
export const usePlansWithAuth = () => {
  const locale = i18n.language || APP_CONFIG.defaultLanguage;

  return useQuery({
    queryKey: ['plans', 'with-auth', locale],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        plans: PlanAuthenticated[];
        enableRealPayments?: boolean;
      }>('/api/v1/plans/with-features', {
        params: { locale },
        skipAuthLogoutOn401: true,
      });
      return {
        plans: response.data.plans,
        enableRealPayments: response.data.enableRealPayments ?? false,
      };
    },
  });
};

// Create Stripe Checkout Session (web only, when enableRealPayments)
/** GET /api/v1/bundles — extra story+audio packs for current plan */
export const useBundles = (enabled: boolean) => {
  return useQuery({
    queryKey: ['bundles'],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        bundles: StoryBundleListItemApi[];
      }>('/api/v1/bundles');
      return response.data.bundles;
    },
    enabled,
  });
};

export const useCreateBundleCheckoutSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bundleSlug: string) => {
      const response = await apiClient.post<{ status: string; sessionId: string; url: string }>(
        '/api/v1/billing/bundle-checkout',
        { bundleSlug }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bundles'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });
};

export const useCreateCheckoutSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planSlug: string) => {
      const response = await apiClient.post<{ status: string; sessionId: string; url: string }>(
        '/api/v1/billing/checkout-session',
        { planSlug }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
    },
  });
};

// Create Stripe Portal Session (manage subscription)
export const useCreatePortalSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<{ status: string; url: string }>(
        '/api/v1/billing/portal-session'
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
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
