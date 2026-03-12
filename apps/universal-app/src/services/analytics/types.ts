/**
 * Analytics provider interface - vendor-agnostic.
 * All analytics calls go through this interface for easy vendor switching.
 */

export interface IAnalyticsProvider {
  identify(userId: string, traits?: Record<string, unknown>): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  screen(name: string, properties?: Record<string, unknown>): void;
  reset(): void;
}
