import { Platform } from 'react-native';
import type { IAnalyticsProvider } from './types';

function getPostHogModule() {
  return Platform.OS === 'web'
    ? (require('./posthogProvider.web') as typeof import('./posthogProvider.web'))
    : (require('./posthogProvider.native') as typeof import('./posthogProvider.native'));
}

export function getPostHogClient(): unknown | null {
  return getPostHogModule().getPostHogClient();
}

export function disablePostHogClient(): void {
  getPostHogModule().disablePostHogClient();
}

export class PostHogProvider implements IAnalyticsProvider {
  private readonly provider: IAnalyticsProvider;

  constructor() {
    const { PostHogProvider: ProviderImpl } = getPostHogModule();
    this.provider = new ProviderImpl();
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    this.provider.identify(userId, traits);
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    this.provider.capture(event, properties);
  }

  screen(name: string, properties?: Record<string, unknown>): void {
    this.provider.screen(name, properties);
  }

  reset(): void {
    this.provider.reset();
  }
}
