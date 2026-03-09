/**
 * Usage metadata returned by AI providers for cost tracking
 */

export interface UsageMetadata {
  provider: string;
  operation: string;
  model?: string;
  inputUnits: number;
  outputUnits?: number;
  thoughtTokens?: number;
  imageTokens?: number;
  durationMs?: number;
  durationSeconds?: number;
}
