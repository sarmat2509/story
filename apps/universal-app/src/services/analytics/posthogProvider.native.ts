/**
 * PostHogProvider for native (iOS/Android) - uses posthog-react-native.
 */

import PostHog from 'posthog-react-native';
import type { IAnalyticsProvider } from './types';

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;

/** Get or create PostHog client. Shared with App's PostHogProvider when used. */
export function getPostHogClient(): PostHog | null {
  if (!API_KEY) return null;
  if (!client) {
    client = new PostHog(API_KEY, {
      host: HOST,
      debug: __DEV__,
    });
  }
  return client;
}

export class PostHogProvider implements IAnalyticsProvider {
  identify(userId: string, traits?: Record<string, unknown>): void {
    const c = getPostHogClient();
    if (c) c.identify(userId, traits);
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    const c = getPostHogClient();
    if (c) c.capture(event, properties);
  }

  screen(name: string, properties?: Record<string, unknown>): void {
    const c = getPostHogClient();
    if (c) c.capture('$screen', { name, ...properties });
  }

  reset(): void {
    const c = getPostHogClient();
    if (c) c.reset();
  }
}
