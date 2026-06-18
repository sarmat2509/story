/**
 * AI Usage Service - Cost tracking for AI provider calls
 * Records usage events and calculates cost based on costConfig
 */

import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { AI_COST_CONFIG } from '../config/costConfig';
import { getAiUsageRepository } from '../repositories';
import { logger } from '../utils/logger';

export interface UsageContext {
  userId?: string | null;
  storyId?: string | null;
  characterId?: string | null;
  childProfileId?: string | null;
}

/** Distinct ai_usage_events.operation values; priced like scene image_generate */
export const USAGE_OP_IMAGE_ENVIRONMENT = 'image_environment';
export const USAGE_OP_IMAGE_OUTFIT_PLATE = 'image_outfit_plate';

/** Deferred TTS prosody LLM (`enrichDeferredProsodyForTtsChunk`); priced like text tokens (same provider/model). */
export const USAGE_OP_TTS_PROSODY_TAGS = 'tts_prosody_tags';

function isImageGenerationPricedOperation(operation: string): boolean {
  return (
    operation === 'image_generate' ||
    operation === 'image_edit' ||
    operation === USAGE_OP_IMAGE_ENVIRONMENT ||
    operation === USAGE_OP_IMAGE_OUTFIT_PLATE
  );
}

function getConfigKey(provider: string, model?: string): string {
  if (model) return model;
  if (provider === 'elevenlabs') return 'elevenlabs-eleven_v3';
  if (provider === 'google-tts') return 'gemini-2.5-flash-tts';
  if (provider === 'grok') return 'xai-tts';
  if (provider === 'openai') return 'gpt-4o-mini-tts';
  if (provider === 'grok') return 'xai-tts';
  if (provider === 'openai') return 'gpt-4o-mini-tts';
  return 'gemini-3-flash-preview';
}

function getTextCostConfig(modelKey: string) {
  if (AI_COST_CONFIG.text[modelKey]) return AI_COST_CONFIG.text[modelKey];
  // Legacy validation runs used gemini-2.5-flash-lite, which may not have
  // an explicit pricing row in local config. Use same-family flash pricing as a
  // conservative fallback instead of unrelated gemini-3-flash-preview pricing.
  if (modelKey.startsWith('gemini-2.5-flash-lite')) {
    return AI_COST_CONFIG.text['gemini-2.5-flash'];
  }
  return AI_COST_CONFIG.text['gemini-3-flash-preview'];
}

/**
 * Calculate cost in USD from usage metadata
 */
function calculateCost(usage: UsageMetadata): number | null {
  const { provider, operation, model } = usage;
  const modelKey = getConfigKey(provider, model);
  const billedInputUnits =
    usage.effectiveInputUnits != null
      ? usage.effectiveInputUnits
      : Math.max(usage.inputUnits - (usage.cachedInputUnits ?? 0), 0);

  try {
    if (
      operation.includes('text') ||
      operation === USAGE_OP_TTS_PROSODY_TAGS ||
      operation === 'character_analysis' ||
      operation === 'translation' ||
      operation === 'face_dedup' ||
      operation === 'image_validation' ||
      operation === 'validateScene' ||
      operation === 'regenerateScene' ||
      operation === 'director'
    ) {
      const textConfig = getTextCostConfig(modelKey);
      if (textConfig && 'inputPer1M' in textConfig) {
        const inputCost = (billedInputUnits / 1e6) * textConfig.inputPer1M;
        const outputCost = ((usage.outputUnits ?? 0) / 1e6) * textConfig.outputPer1M;
        return inputCost + outputCost;
      }
    }

    if (isImageGenerationPricedOperation(operation)) {
      const imageConfig = AI_COST_CONFIG.image[modelKey];
      if (typeof imageConfig === 'number') {
        return imageConfig;
      }
      if (imageConfig && typeof imageConfig === 'object') {
        const imgConfig = imageConfig as {
          imageRatePer1M: number;
          inputPer1M?: number;
          thinkingRatePer1M?: number;
          imageTokens1K?: number;
          imageTokensPer1K?: number;
        };
        const imageTokens =
          usage.imageTokens ?? imgConfig.imageTokens1K ?? imgConfig.imageTokensPer1K ?? 1120;
        const thoughtTokens = usage.thoughtTokens ?? 0;
        const inputCost =
          imgConfig.inputPer1M != null ? (billedInputUnits / 1e6) * imgConfig.inputPer1M : 0;
        const imageCost = (imageTokens / 1e6) * imgConfig.imageRatePer1M;
        const thinkingCost = imgConfig.thinkingRatePer1M
          ? (thoughtTokens / 1e6) * imgConfig.thinkingRatePer1M
          : 0;
        return inputCost + imageCost + thinkingCost;
      }
      return 0.04;
    }

    if (operation === 'audio_synthesize') {
      const audioConfig = AI_COST_CONFIG.audio[modelKey];
      if (typeof audioConfig === 'number') {
        return usage.inputUnits * audioConfig;
      }
      if (audioConfig && typeof audioConfig === 'object' && 'audioTokensPerSecond' in audioConfig) {
        const inputCost = (usage.inputUnits / 1e6) * audioConfig.inputPer1M;
        const outputTokens = (usage.durationSeconds ?? 0) * audioConfig.audioTokensPerSecond;
        const outputCost = (outputTokens / 1e6) * audioConfig.outputPer1M;
        return inputCost + outputCost;
      }
    }
  } catch (err) {
    logger.warn({ err, usage }, 'Failed to calculate AI cost');
  }
  return null;
}

/** Estimated USD cost from usage metadata (same formula as DB recording). */
export function estimateUsageCostUsd(usage: UsageMetadata): number | null {
  return calculateCost(usage);
}

/**
 * Record an AI usage event
 */
export async function recordUsage(usage: UsageMetadata, context: UsageContext): Promise<void> {
  try {
    const costUsd = calculateCost(usage);
    const billedInputUnits =
      usage.effectiveInputUnits != null
        ? usage.effectiveInputUnits
        : Math.max(usage.inputUnits - (usage.cachedInputUnits ?? 0), 0);
    const repo = getAiUsageRepository();

    await repo.create({
      userId: context.userId ?? null,
      storyId: context.storyId ?? null,
      characterId: context.characterId ?? null,
      childProfileId: context.childProfileId ?? null,
      provider: usage.provider,
      operation: usage.operation,
      model: usage.model ?? null,
      inputUnits: usage.inputUnits,
      outputUnits: usage.outputUnits ?? null,
      costUsd: costUsd != null ? costUsd : null,
      durationMs: usage.durationMs ?? null,
      metadata:
        usage.thoughtTokens != null ||
        usage.imageTokens != null ||
        usage.durationSeconds != null ||
        usage.cachedInputUnits != null ||
        usage.effectiveInputUnits != null ||
        usage.cacheHit != null
          ? {
              thoughtTokens: usage.thoughtTokens,
              imageTokens: usage.imageTokens,
              durationSeconds: usage.durationSeconds,
              cachedInputUnits: usage.cachedInputUnits,
              effectiveInputUnits:
                usage.effectiveInputUnits != null ? usage.effectiveInputUnits : billedInputUnits,
              cacheHit: usage.cacheHit,
            }
          : null,
    });

    logger.debug(
      {
        provider: usage.provider,
        operation: usage.operation,
        costUsd,
        storyId: context.storyId,
      },
      'AI usage recorded'
    );
  } catch (err) {
    logger.error({ err, usage, context }, 'Failed to record AI usage');
  }
}

/**
 * Get total cost for a story
 */
export async function getStoryCost(storyId: string): Promise<number> {
  return getAiUsageRepository().getStoryCost(storyId);
}

/**
 * Get cost breakdown for a story (for admin/debug)
 */
export async function getStoryCostBreakdown(storyId: string): Promise<
  Array<{
    provider: string;
    operation: string;
    model: string | null;
    costUsd: number;
    createdAt: Date;
  }>
> {
  return getAiUsageRepository().getStoryCostBreakdown(storyId);
}

export async function getStoryCacheStats(storyId: string): Promise<{
  totalCachedInputUnits: number;
  totalEffectiveInputUnits: number;
  cacheHitCount: number;
  cachedOperationCount: number;
}> {
  const events = await getAiUsageRepository().listByStoryId(storyId);
  let totalCachedInputUnits = 0;
  let totalEffectiveInputUnits = 0;
  let cacheHitCount = 0;
  let cachedOperationCount = 0;

  for (const event of events) {
    const metadata = event.metadata ?? {};
    const cachedInputUnitsRaw = metadata['cachedInputUnits'];
    const effectiveInputUnitsRaw = metadata['effectiveInputUnits'];
    const cacheHitRaw = metadata['cacheHit'];
    const cachedInputUnits =
      typeof cachedInputUnitsRaw === 'number'
        ? cachedInputUnitsRaw
        : typeof cachedInputUnitsRaw === 'string'
          ? Number(cachedInputUnitsRaw)
          : 0;
    const effectiveInputUnits =
      typeof effectiveInputUnitsRaw === 'number'
        ? effectiveInputUnitsRaw
        : typeof effectiveInputUnitsRaw === 'string'
          ? Number(effectiveInputUnitsRaw)
          : Math.max((event.inputUnits ?? 0) - cachedInputUnits, 0);
    const cacheHit = typeof cacheHitRaw === 'boolean' ? cacheHitRaw : cachedInputUnits > 0;

    totalCachedInputUnits += Number.isFinite(cachedInputUnits) ? cachedInputUnits : 0;
    totalEffectiveInputUnits += Number.isFinite(effectiveInputUnits) ? effectiveInputUnits : 0;
    if (cacheHit) cacheHitCount += 1;
    if (cachedInputUnits > 0 || cacheHit) cachedOperationCount += 1;
  }

  return {
    totalCachedInputUnits,
    totalEffectiveInputUnits,
    cacheHitCount,
    cachedOperationCount,
  };
}

/**
 * Get user's AI cost for a month
 */
export async function getUserMonthlyCost(
  userId: string,
  year: number,
  month: number
): Promise<number> {
  return getAiUsageRepository().getUserMonthlyCost(userId, year, month);
}
