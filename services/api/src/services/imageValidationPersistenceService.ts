/**
 * Persist vision validation outcomes without failing image generation.
 */

import type { ImageValidationResult } from '../ai/types';
import { getImageValidationRepository } from '../repositories';
import { logger } from '../utils/logger';

export function normalizeValidationScoreForStorage(score: number | null): number | null {
  if (score == null) return null;
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function persistImageValidationResult(params: {
  storyId: string;
  sceneIndex: number;
  attempt: number;
  subjectType?: string;
  pageNumber?: number | null;
  panelIndex?: number | null;
  panelId?: string | null;
  cropRect?: Record<string, unknown> | null;
  imageStoragePath: string;
  validationScore: number | null;
  visionModel?: string | null;
  validation: ImageValidationResult;
}): Promise<void> {
  try {
    await getImageValidationRepository().insert({
      storyId: params.storyId,
      sceneIndex: params.sceneIndex,
      attempt: params.attempt,
      subjectType: params.subjectType,
      pageNumber: params.pageNumber,
      panelIndex: params.panelIndex,
      panelId: params.panelId,
      cropRect: params.cropRect,
      imageStoragePath: params.imageStoragePath,
      validationScore: normalizeValidationScoreForStorage(params.validationScore),
      validationStatus: params.validation.validationStatus ?? 'completed',
      visionModel: params.visionModel ?? null,
      requestManifest: params.validation.requestManifest ?? null,
      providerError: params.validation.providerError ?? null,
      result: params.validation as unknown as Record<string, unknown>,
    });
  } catch (err) {
    logger.error(
      {
        err,
        storyId: params.storyId,
        sceneIndex: params.sceneIndex,
        attempt: params.attempt,
      },
      'Failed to persist image validation result'
    );
  }
}
