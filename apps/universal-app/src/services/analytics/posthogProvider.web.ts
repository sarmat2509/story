/**
 * PostHogProvider for web - uses posthog-js (posthog-react-native has limited web support).
 */

import posthog from 'posthog-js';
import type { IAnalyticsProvider } from './types';

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let initialized = false;

function ensureInit(): boolean {
  if (!API_KEY) return false;
  if (!initialized) {
    posthog.init(API_KEY, {
      api_host: HOST,
      person_profiles: 'identified_only',
      capture_pageview: false,
    });
    initialized = true;
  }
  return true;
}

export function getPostHogClient(): typeof posthog | null {
  return ensureInit() ? posthog : null;
}

export class PostHogProvider implements IAnalyticsProvider {
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (ensureInit()) {
      posthog.identify(userId, traits);
    }
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (ensureInit()) {
      posthog.capture(event, properties);
    }
  }

  screen(name: string, properties?: Record<string, unknown>): void {
    if (ensureInit()) {
      posthog.capture('$screen', { name, ...properties });
    }
  }

  reset(): void {
    if (initialized) {
      posthog.reset();
    }
  }
}
