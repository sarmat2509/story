/**
 * NoopProvider - Analytics stub when vendor is disabled or key not configured.
 */

import type { IAnalyticsProvider } from './types';

export class NoopProvider implements IAnalyticsProvider {
  identify(_userId: string, _traits?: Record<string, unknown>): void {
    // no-op
  }

  capture(_event: string, _properties?: Record<string, unknown>): void {
    // no-op
  }

  screen(_name: string, _properties?: Record<string, unknown>): void {
    // no-op
  }

  reset(): void {
    // no-op
  }
}
