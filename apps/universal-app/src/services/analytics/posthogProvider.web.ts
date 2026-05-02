/**
 * PostHogProvider for web - uses posthog-js (posthog-react-native has limited web support).
 */

import posthog, { type CaptureResult } from 'posthog-js';
import type { IAnalyticsProvider } from './types';
import { isAnalyticsAllowed } from './consent';

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let initialized = false;

const SENSITIVE_ANALYTICS_PROPERTY_NAMES = new Set([
  'childname',
  'child_name',
  'displayname',
  'display_name',
  'email',
  'errormessage',
  'error_message',
  'message',
  'prompt',
  'storytitle',
  'story_title',
]);

function scrubAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event?.properties) return event;

  const properties = { ...event.properties };
  for (const key of Object.keys(properties)) {
    if (SENSITIVE_ANALYTICS_PROPERTY_NAMES.has(key.toLowerCase())) {
      delete properties[key];
    }
  }

  return { ...event, properties };
}

function ensureInit(): boolean {
  if (!API_KEY) return false;
  if (!isAnalyticsAllowed()) return false;
  if (initialized) {
    posthog.opt_in_capturing();
    return true;
  }
  if (!initialized) {
    posthog.init(API_KEY, {
      api_host: HOST,
      person_profiles: 'identified_only',
      advanced_disable_feature_flags: true,
      advanced_disable_feature_flags_on_first_load: true,
      advanced_disable_flags: true,
      advanced_disable_toolbar_metrics: true,
      autocapture: false,
      before_send: scrubAnalyticsEvent,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_pageleave: false,
      capture_pageview: false,
      capture_performance: false,
      custom_personal_data_properties: ['email', 'displayName', 'story_title', 'error_message'],
      disable_conversations: true,
      disable_external_dependency_loading: true,
      disable_product_tours: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_surveys_automatic_display: true,
      enable_recording_console_log: false,
      ip: false,
      mask_all_element_attributes: true,
      mask_all_text: true,
      mask_personal_data_properties: true,
      opt_in_site_apps: false,
      property_denylist: ['email', 'displayName', 'story_title', 'error_message'],
      rageclick: false,
      remote_config_refresh_interval_ms: 0,
      save_campaign_params: false,
      save_referrer: false,
    });
    posthog.opt_in_capturing();
    initialized = true;
  }
  return true;
}

export function getPostHogClient(): typeof posthog | null {
  return ensureInit() ? posthog : null;
}

export function disablePostHogClient(): void {
  if (!initialized) return;
  posthog.opt_out_capturing();
  posthog.reset();
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
