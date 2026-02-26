/**
 * Generation Time Service
 * 
 * Tracks and calculates rolling average generation times for:
 * - Text generation (per story)
 * - Validation (per scene)
 * - Image generation (per image)
 * - Audio generation (per character of text)
 * 
 * Used by progress tracking and queue wait estimation.
 */

import { getStoryRepository, getAssetRepository } from '../repositories';
import { logger } from '../utils/logger';

// Default fallback values (in milliseconds)
const DEFAULTS = {
  textGenerationMs: 30000,        // 30s
  validationMsPerScene: 2000,     // 2s per scene
  imageGenerationMs: 15000,       // 15s per image
  audioMsPerChar: 5,              // 5ms per character
};

export interface GenerationCoefficients {
  avgTextMs: number;
  avgValidationMsPerScene: number;
  avgMsPerImage: number;
  avgAudioMsPerChar: number;
}

// In-memory cache with 2-minute TTL to avoid repeated DB queries under load
const CACHE_TTL_MS = 120_000;
let cachedCoefficients: { data: GenerationCoefficients; expiresAt: number } | null = null;

/**
 * Calculate rolling average generation time coefficients from recent stories.
 * Uses last N completed stories for each metric.
 * Results are cached for 2 minutes to reduce DB load under concurrent usage.
 */
export async function getGenerationCoefficients(sampleSize: number = 20): Promise<GenerationCoefficients> {
  // Return cached result if still valid
  if (cachedCoefficients && Date.now() < cachedCoefficients.expiresAt) {
    return cachedCoefficients.data;
  }

  try {
    const storyRepo = getStoryRepository();
    const assetRepo = getAssetRepository();

    // Get recent stories with generation time metadata
    const recentStories = await storyRepo.findRecentWithMetadata(sampleSize * 2);

    // Extract text and validation times from story metadata
    const textTimes: number[] = [];
    const validationTimesPerScene: number[] = [];

    for (const story of recentStories) {
      const meta = story.metadata as any;
      if (meta?.textGenerationTimeMs && meta.textGenerationTimeMs > 0) {
        textTimes.push(meta.textGenerationTimeMs);
      }
      if (meta?.validationTimeMs && meta.validationTimeMs > 0 && meta?.sceneCount > 0) {
        validationTimesPerScene.push(meta.validationTimeMs / meta.sceneCount);
      }
    }

    // Get recent image generation times from assets table
    const recentImageAssets = await assetRepo.findRecentImageGenerationTimes(sampleSize * 3);

    const imageTimes = recentImageAssets
      .map(a => a.generationTimeMs)
      .filter((t): t is number => t != null && t > 0);

    // Get audio coefficient from stories with audioMetadata
    const audioStories = await storyRepo.findRecentWithAudioMetadata(sampleSize);

    const audioMsPerCharValues: number[] = [];
    for (const story of audioStories) {
      const audioMeta = story.audioMetadata as any;
      const storyMeta = story.metadata as any;
      if (audioMeta?.audioGenerationTimeMs && storyMeta?.fullTextLength) {
        audioMsPerCharValues.push(audioMeta.audioGenerationTimeMs / storyMeta.fullTextLength);
      }
    }

    const coefficients: GenerationCoefficients = {
      avgTextMs: avg(textTimes, DEFAULTS.textGenerationMs),
      avgValidationMsPerScene: avg(validationTimesPerScene, DEFAULTS.validationMsPerScene),
      avgMsPerImage: avg(imageTimes, DEFAULTS.imageGenerationMs),
      avgAudioMsPerChar: avg(audioMsPerCharValues, DEFAULTS.audioMsPerChar),
    };

    logger.debug({
      textSamples: textTimes.length,
      validationSamples: validationTimesPerScene.length,
      imageSamples: imageTimes.length,
      audioSamples: audioMsPerCharValues.length,
      coefficients,
    }, 'Generation coefficients calculated');

    // Cache the result
    cachedCoefficients = { data: coefficients, expiresAt: Date.now() + CACHE_TTL_MS };

    return coefficients;
  } catch (error) {
    logger.error({ error }, 'Failed to calculate generation coefficients, using defaults');
    const fallback: GenerationCoefficients = {
      avgTextMs: DEFAULTS.textGenerationMs,
      avgValidationMsPerScene: DEFAULTS.validationMsPerScene,
      avgMsPerImage: DEFAULTS.imageGenerationMs,
      avgAudioMsPerChar: DEFAULTS.audioMsPerChar,
    };
    // Cache the fallback too to avoid repeated failed queries
    cachedCoefficients = { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
    return fallback;
  }
}

/**
 * Estimate total generation time for a story
 */
export function estimateStoryGenerationMs(
  coefficients: GenerationCoefficients,
  sceneCount: number,
  imageCount: number,
): { textMs: number; validationMs: number; totalImageMs: number; totalMs: number } {
  const textMs = coefficients.avgTextMs;
  const validationMs = coefficients.avgValidationMsPerScene * sceneCount;
  const totalImageMs = coefficients.avgMsPerImage * imageCount;
  const totalMs = textMs + validationMs + totalImageMs;

  return { textMs, validationMs, totalImageMs, totalMs };
}

/**
 * Estimate audio generation time
 */
export function estimateAudioGenerationMs(
  coefficients: GenerationCoefficients,
  textLength: number,
): number {
  return Math.round(coefficients.avgAudioMsPerChar * textLength);
}

// ── Helpers ──

function avg(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
