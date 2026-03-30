/**
 * Usage metadata returned by AI providers for cost tracking
 */

export interface UsageMetadata {
  provider: string;
  operation: string;
  model?: string;
  inputUnits: number;
  effectiveInputUnits?: number;
  outputUnits?: number;
  cachedInputUnits?: number;
  cacheHit?: boolean;
  thoughtTokens?: number;
  imageTokens?: number;
  durationMs?: number;
  durationSeconds?: number;
}
