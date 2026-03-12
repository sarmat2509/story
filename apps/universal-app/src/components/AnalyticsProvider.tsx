/**
 * AnalyticsProvider - Conditionally wraps app with PostHog when vendor=posthog.
 * On web: posthog-js is initialized in posthogProvider.web (no wrapper needed).
 * On native: PostHogProvider from posthog-react-native for autocapture.
 */

import React from 'react';
import { Platform } from 'react-native';
import { getPostHogClient } from '@/services/analytics/posthogProvider';

const vendor = process.env.EXPO_PUBLIC_ANALYTICS_VENDOR ?? 'none';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  if (vendor !== 'posthog') {
    return <>{children}</>;
  }

  // Web: posthog-js initializes on first capture, no provider wrapper needed
  if (Platform.OS === 'web') {
    getPostHogClient(); // Ensure init
    return <>{children}</>;
  }

  // Native: wrap with PostHogProvider for autocapture
  const client = getPostHogClient();
  if (!client) {
    return <>{children}</>;
  }
  const { PostHogProvider } = require('posthog-react-native');
  return <PostHogProvider client={client}>{children}</PostHogProvider>;
}
