/**
 * PostHogProvider for native (iOS/Android) - uses posthog-react-native.
 */

import PostHog from 'posthog-react-native';
import type { IAnalyticsProvider } from './types';

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type PostHogEventProperties = Record<string, JsonValue>;

function toJsonType(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => toJsonType(item))
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => {
        const normalized = toJsonType(entryValue);
        return normalized === undefined ? null : [key, normalized] as const;
      })
      .filter((entry): entry is readonly [string, JsonValue] => entry !== null);
    return Object.fromEntries(entries);
  }
  return undefined;
}

function toPostHogProperties(
  properties?: Record<string, unknown>,
): PostHogEventProperties | undefined {
  if (!properties) return undefined;
  const normalized = Object.entries(properties)
    .map(([key, value]) => {
      const jsonValue = toJsonType(value);
      return jsonValue === undefined ? null : [key, jsonValue] as const;
    })
    .filter((entry): entry is readonly [string, JsonValue] => entry !== null);
  return normalized.length > 0
    ? (Object.fromEntries(normalized) as PostHogEventProperties)
    : undefined;
}

/** Get or create PostHog client. Shared with App's PostHogProvider when used. */
export function getPostHogClient(): PostHog | null {
  if (!API_KEY) return null;
  if (!client) {
    client = new PostHog(API_KEY, {
      host: HOST,
    });
    if (__DEV__) {
      client.debug();
    }
  }
  return client;
}

export function disablePostHogClient(): void {
  const c = client;
  if (c) c.reset();
}

export class PostHogProvider implements IAnalyticsProvider {
  identify(userId: string, traits?: Record<string, unknown>): void {
    const c = getPostHogClient();
    if (c) c.identify(userId, toPostHogProperties(traits));
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    const c = getPostHogClient();
    if (c) c.capture(event, toPostHogProperties(properties));
  }

  screen(name: string, properties?: Record<string, unknown>): void {
    const c = getPostHogClient();
    if (c) c.capture('$screen', toPostHogProperties({ name, ...(properties ?? {}) }));
  }

  reset(): void {
    const c = getPostHogClient();
    if (c) c.reset();
  }
}
