/**
 * Persist vision validation outcomes without failing image generation.
 */

import type { ImageValidationResult } from '../ai/types';
import { getImageValidationRepository } from '../repositories';
import { logger } from '../utils/logger';

export async function persistImageValidationResult(params: {
  storyId: string;
  sceneIndex: number;
  attempt: number;
  imageStoragePath: string;
  validationScore: number;
  visionModel?: string | null;
  validation: ImageValidationResult;
}): Promise<void> {
  try {
    await getImageValidationRepository().insert({
      storyId: params.storyId,
      sceneIndex: params.sceneIndex,
      attempt: params.attempt,
      imageStoragePath: params.imageStoragePath,
      validationScore: params.validationScore,
      visionModel: params.visionModel ?? null,
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
