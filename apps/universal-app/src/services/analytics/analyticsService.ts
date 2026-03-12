/**
 * Analytics facade - vendor-agnostic entry point.
 * Use getAnalytics() for all analytics calls. Switch vendor via EXPO_PUBLIC_ANALYTICS_VENDOR.
 */

import type { IAnalyticsProvider } from './types';
import { NoopProvider } from './noopProvider';
import { PostHogProvider } from './posthogProvider';

let instance: IAnalyticsProvider | null = null;

function createProvider(vendor: string): IAnalyticsProvider {
  switch (vendor) {
    case 'posthog':
      return new PostHogProvider();
    default:
      return new NoopProvider();
  }
}

export function getAnalytics(): IAnalyticsProvider {
  if (!instance) {
    const vendor = process.env.EXPO_PUBLIC_ANALYTICS_VENDOR ?? 'none';
    instance = createProvider(vendor);
  }
  return instance;
}
