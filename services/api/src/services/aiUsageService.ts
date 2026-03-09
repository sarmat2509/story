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

function getConfigKey(provider: string, model?: string): string {
  if (model) return model;
  if (provider === 'elevenlabs') return 'elevenlabs-eleven_v3';
  if (provider === 'google-tts') return 'gemini-2.5-flash-tts';
  return 'gemini-2.5-flash';
}

/**
 * Calculate cost in USD from usage metadata
 */
function calculateCost(usage: UsageMetadata): number | null {
  const { provider, operation, model } = usage;
  const modelKey = getConfigKey(provider, model);

  try {
    if (operation.includes('text') || operation === 'character_analysis' || operation === 'translation' || operation === 'face_dedup' || operation === 'image_validation' || operation === 'validateScene' || operation === 'regenerateScene' || operation === 'director') {
      const textConfig = AI_COST_CONFIG.text[modelKey] || AI_COST_CONFIG.text['gemini-2.5-flash'];
      if (textConfig && 'inputPer1M' in textConfig) {
        const inputCost = (usage.inputUnits / 1e6) * textConfig.inputPer1M;
        const outputCost = ((usage.outputUnits ?? 0) / 1e6) * textConfig.outputPer1M;
        return inputCost + outputCost;
      }
    }

    if (operation === 'image_generate' || operation === 'image_edit') {
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
        const imageTokens = usage.imageTokens ?? imgConfig.imageTokens1K ?? imgConfig.imageTokensPer1K ?? 1120;
        const thoughtTokens = usage.thoughtTokens ?? 0;
        const inputCost =
          imgConfig.inputPer1M != null
            ? (usage.inputUnits / 1e6) * imgConfig.inputPer1M
            : 0;
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

/**
 * Record an AI usage event
 */
export async function recordUsage(usage: UsageMetadata, context: UsageContext): Promise<void> {
  try {
    const costUsd = calculateCost(usage);
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
        usage.thoughtTokens != null || usage.imageTokens != null || usage.durationSeconds != null
          ? {
              thoughtTokens: usage.thoughtTokens,
              imageTokens: usage.imageTokens,
              durationSeconds: usage.durationSeconds,
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
 * Get user's AI cost for a month
 */
export async function getUserMonthlyCost(userId: string, year: number, month: number): Promise<number> {
  return getAiUsageRepository().getUserMonthlyCost(userId, year, month);
}
