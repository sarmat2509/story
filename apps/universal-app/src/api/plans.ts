import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  PlanPublicApi,
  PlanAuthenticatedApi,
  type BillingCurrency,
  type StoryBundleListItemApi,
} from '@wondertales/shared';
import { APP_CONFIG } from '@/config/constants';
import apiClient from './client';
import i18n from '@/config/i18n';

// Use shared types - renamed for clarity
type PlanPublic = PlanPublicApi;
type PlanAuthenticated = PlanAuthenticatedApi;

export function invalidateBillingState(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['plans'] });
  queryClient.invalidateQueries({ queryKey: ['plans', 'with-auth'] });
  queryClient.invalidateQueries({ queryKey: ['bundles'] });
  queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
}

export interface PlansCatalogData {
  plans: PlanPublic[];
  enableRealPayments: boolean;
  billingCurrency: BillingCurrency;
  supportedBillingCurrencies: BillingCurrency[];
}

export interface DiscountPreviewData {
  code: string;
  kind: 'subscription' | 'bundle';
  percentOff: number;
  durationMonths: number | null;
  originalAmountMinor: number;
  discountAmountMinor: number;
  finalAmountMinor: number;
  pricingCurrency: BillingCurrency;
  estimatedEndsAt: string | null;
  quoteFingerprint: string;
  planSlug: string | null;
  planName: string | null;
  bundleSlug: string | null;
  bundleName: string | null;
}

// Get plans with features (public, works for all users)
export const usePlans = (currency?: BillingCurrency) => {
  const locale = i18n.language || APP_CONFIG.defaultLanguage;

  return useQuery({
    queryKey: ['plans', locale, currency ?? 'default'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; plans: PlanPublic[] }>(
        '/api/v1/plans',
        { params: { locale, currency } }
      );
      return response.data.plans;
    },
  });
};

export const usePlansCatalog = (currency?: BillingCurrency) => {
  const locale = i18n.language || APP_CONFIG.defaultLanguage;

  return useQuery({
    queryKey: ['plans', 'catalog', locale, currency ?? 'default'],
    queryFn: async (): Promise<PlansCatalogData> => {
      const response = await apiClient.get<{
        status: string;
        plans: PlanPublic[];
        enableRealPayments?: boolean;
        billingCurrency?: BillingCurrency;
        supportedBillingCurrencies?: BillingCurrency[];
      }>('/api/v1/plans', { params: { locale, currency } });
      return {
        plans: response.data.plans,
        enableRealPayments: response.data.enableRealPayments ?? false,
        billingCurrency: response.data.billingCurrency ?? currency ?? 'EUR',
        supportedBillingCurrencies: response.data.supportedBillingCurrencies ?? ['EUR', 'USD'],
      };
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
  graphicNovels?: {
    used: number;
    limit: number;
    remaining: number;
    planLimit?: number;
    bundleBonus?: number;
  };
  mixedStories?: {
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
  imagesPerStory: number;
  storyCharacterSelectionLimit: number;
  resetsAt: string;
  currentPeriodEnd?: string;
  subscriptionStatus?: string;
  cancelAtPeriodEnd?: boolean;
  paymentProvider?: string | null;
  enableRealPayments?: boolean;
}

type SubscriptionUsageApiData = SubscriptionUsageData & {
  images_per_story?: number;
  story_character_selection_limit?: number;
  current_period_end?: string;
  subscription_status?: string;
  cancel_at_period_end?: boolean;
  payment_provider?: string | null;
  enable_real_payments?: boolean;
  stories: SubscriptionUsageData['stories'] & {
    plan_limit?: number;
    bundle_bonus?: number;
  };
  audio: SubscriptionUsageData['audio'] & {
    plan_limit?: number;
    bundle_bonus?: number;
  };
  graphicNovels?: SubscriptionUsageData['stories'] & {
    plan_limit?: number;
    bundle_bonus?: number;
  };
  graphic_novels?: SubscriptionUsageData['stories'] & {
    plan_limit?: number;
    bundle_bonus?: number;
  };
  mixedStories?: SubscriptionUsageData['stories'] & {
    plan_limit?: number;
    bundle_bonus?: number;
  };
  mixed_stories?: SubscriptionUsageData['stories'] & {
    plan_limit?: number;
    bundle_bonus?: number;
  };
};

function normalizeUsageBucket(
  bucket: SubscriptionUsageApiData['stories']
): SubscriptionUsageData['stories'] {
  return {
    used: bucket.used,
    limit: bucket.limit,
    remaining: bucket.remaining,
    planLimit: bucket.planLimit ?? bucket.plan_limit,
    bundleBonus: bucket.bundleBonus ?? bucket.bundle_bonus,
  };
}

function normalizeSubscriptionUsage(data: SubscriptionUsageApiData): SubscriptionUsageData {
  return {
    stories: normalizeUsageBucket(data.stories),
    graphicNovels: data.graphicNovels
      ? normalizeUsageBucket(data.graphicNovels)
      : data.graphic_novels
        ? normalizeUsageBucket(data.graphic_novels)
        : undefined,
    mixedStories: data.mixedStories
      ? normalizeUsageBucket(data.mixedStories)
      : data.mixed_stories
        ? normalizeUsageBucket(data.mixed_stories)
        : undefined,
    audio: normalizeUsageBucket(data.audio),
    imagesPerStory: data.imagesPerStory ?? data.images_per_story ?? 1,
    storyCharacterSelectionLimit:
      data.storyCharacterSelectionLimit ?? data.story_character_selection_limit ?? 3,
    resetsAt: data.resetsAt,
    currentPeriodEnd: data.currentPeriodEnd ?? data.current_period_end,
    subscriptionStatus: data.subscriptionStatus ?? data.subscription_status,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? data.cancel_at_period_end,
    paymentProvider: data.paymentProvider ?? data.payment_provider,
    enableRealPayments: data.enableRealPayments ?? data.enable_real_payments,
  };
}

export const useSubscriptionUsage = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['subscription-usage'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: SubscriptionUsageApiData }>(
        '/api/v1/me/subscription-usage'
      );
      return normalizeSubscriptionUsage(response.data.data);
    },
    enabled,
  });
};

// Get plans with current plan info (authenticated only)
export const usePlansWithAuth = (enabled: boolean = true, currency?: BillingCurrency) => {
  const locale = i18n.language || APP_CONFIG.defaultLanguage;

  return useQuery({
    queryKey: ['plans', 'with-auth', locale, currency ?? 'preferred'],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        plans: PlanAuthenticated[];
        enableRealPayments?: boolean;
        billingCurrency?: BillingCurrency;
        preferredBillingCurrency?: BillingCurrency;
        supportedBillingCurrencies?: BillingCurrency[];
      }>('/api/v1/plans/with-features', {
        params: { locale, currency },
        skipAuthLogoutOn401: true,
      });
      return {
        plans: response.data.plans,
        enableRealPayments: response.data.enableRealPayments ?? false,
        billingCurrency: response.data.billingCurrency ?? currency ?? 'EUR',
        preferredBillingCurrency:
          response.data.preferredBillingCurrency ?? response.data.billingCurrency ?? 'EUR',
        supportedBillingCurrencies: response.data.supportedBillingCurrencies ?? ['EUR', 'USD'],
      };
    },
    enabled,
  });
};

export const useUpdateBillingCurrency = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (currency: BillingCurrency) => {
      const response = await apiClient.put<{
        status: string;
        preferredBillingCurrency: BillingCurrency;
      }>('/api/v1/plans/billing-currency', { currency });
      return response.data;
    },
    onSuccess: () => {
      invalidateBillingState(queryClient);
    },
  });
};

// Create Stripe Checkout Session (web only, when enableRealPayments)
/** GET /api/v1/bundles — extra story+audio packs for current plan */
export const useBundles = (
  enabled: boolean,
  currentPlanSlug?: string | null,
  currency?: BillingCurrency
) => {
  return useQuery({
    queryKey: ['bundles', currentPlanSlug ?? 'unknown-plan', currency ?? 'preferred'],
    queryFn: async () => {
      const response = await apiClient.get<{
        status: string;
        bundles: StoryBundleListItemApi[];
      }>('/api/v1/bundles', { params: { currency } });
      return response.data.bundles;
    },
    enabled: enabled && !!currentPlanSlug,
  });
};

export const useCreateBundleCheckoutSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bundleSlug: string;
      currency?: BillingCurrency;
      discountCode?: string;
      discountQuoteFingerprint?: string;
    }) => {
      const response = await apiClient.post<{ status: string; sessionId: string; url: string }>(
        '/api/v1/billing/bundle-checkout',
        input
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateBillingState(queryClient);
    },
  });
};

export const useCreateCheckoutSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      planSlug: string;
      currency?: BillingCurrency;
      discountCode?: string;
      discountQuoteFingerprint?: string;
    }) => {
      const response = await apiClient.post<{ status: string; sessionId: string; url: string }>(
        '/api/v1/billing/checkout-session',
        input
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateBillingState(queryClient);
    },
  });
};

export const usePreviewDiscount = () => {
  return useMutation({
    mutationFn: async (input: {
      code: string;
      kind: 'subscription' | 'bundle';
      planSlug?: string;
      bundleSlug?: string;
      currency?: BillingCurrency;
    }) => {
      const response = await apiClient.post<{ status: string; data: DiscountPreviewData }>(
        '/api/v1/billing/discount-preview',
        input
      );
      return response.data.data;
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
      invalidateBillingState(queryClient);
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
      invalidateBillingState(queryClient);
    },
  });
};
