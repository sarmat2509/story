/**
 * Story validation functions
 */

import { logger } from '../../utils/logger';
import { getStoryDomainService } from '../aiService';
import { recordUsage } from '../aiUsageService';
import { startTask, completeTask, STORY_TASKS } from '../storyProgress';
import { getGenerationCoefficients } from '../generationTimeService';
import type { ValidateParams, ValidateResult } from './types';

type SceneValidationLike = {
  sceneId: number;
  isValid: boolean;
  violations: Array<{ category: string; message: string }>;
  correctedCameraComposition?: { shot: string; characters: Array<{ name: string; description: string }> };
};

/**
 * Validate story scenes with retry logic
 * Used by both standard and continuation flows
 */
export async function validateStoryScenes(params: ValidateParams): Promise<ValidateResult> {
  const { requestId, userId, storyId, text, spec, maxRetries = 2 } = params;
  const usageContext = { userId, storyId };

  const storyDomain = getStoryDomainService();
  const coefficients = await getGenerationCoefficients();

  const validationStart = Date.now();
  await startTask(requestId, STORY_TASKS.VALIDATING, {
    estimatedMs: coefficients.avgValidationMsPerScene * (text?.scenes?.length || 6),
  });

  logger.info({ requestId, sceneCount: text.scenes.length }, 'Starting batch scene validation');
  const batchResult = await storyDomain.validateScenesBatch(
    text.scenes,
    spec.policyProfile,
    spec.scenarioCard?.id,
    { onUsage: (u) => recordUsage(u, usageContext) }
  );
  const failedMap = new Map(batchResult.failedScenes.map((f) => [f.sceneId, f]));
  const validations: SceneValidationLike[] = text.scenes.map((scene: any) => {
    const failed = failedMap.get(scene.sceneId);
    if (failed) {
      return {
        sceneId: scene.sceneId,
        isValid: false,
        violations: failed.violations,
        correctedCameraComposition: failed.correctedCameraComposition,
      };
    }
    return { sceneId: scene.sceneId, isValid: true, violations: [] };
  });

  // Apply correctedCameraComposition directly (no regeneration needed)
  for (const validation of validations) {
    if (validation.correctedCameraComposition) {
      const scene = text.scenes.find((s: any) => s.sceneId === validation.sceneId);
      if (scene?.sceneVisual) {
        scene.sceneVisual.cameraComposition = validation.correctedCameraComposition;
        logger.info(
          { requestId, sceneId: validation.sceneId, characterCount: validation.correctedCameraComposition.characters.length },
          'Applied correctedCameraComposition to scene'
        );
      }
    }
  }

  // failedScenes: exclude scenes that only had camera_composition_incomplete and we fixed it
  const hasOtherViolations = (v: SceneValidationLike) =>
    v.violations.some((viol: any) => viol.category !== 'camera_composition_incomplete');
  const failedScenes = validations.filter(
    (v) => !v.isValid && (!v.correctedCameraComposition || hasOtherViolations(v))
  );

  if (failedScenes.length > 0) {
    logger.info({
      requestId,
      failedCount: failedScenes.length,
      sceneIds: failedScenes.map((f) => f.sceneId),
    }, 'Some scenes failed validation, starting regeneration');

    // SELECTIVE REGENERATION WITH RETRY LOOP
    const scenesToRegenerate = new Map(failedScenes.map((f) => [f.sceneId, 0]));

    for (let attempt = 0; attempt < maxRetries && scenesToRegenerate.size > 0; attempt++) {
      logger.info({
        requestId,
        attempt: attempt + 1,
        scenesToRegenerate: Array.from(scenesToRegenerate.keys()),
      }, 'Regeneration attempt');

      const sceneIds = Array.from(scenesToRegenerate.keys());
      const batchFailedScenes = sceneIds.map((sceneId) => {
        const scene = text.scenes.find((s: any) => s.sceneId === sceneId);
        const validation = validations.find((v) => v.sceneId === sceneId);
        const feedback = validation?.violations.map((v: any) => v.message).join('; ') || '';
        return {
          sceneId,
          originalText: scene?.text ?? '',
          feedback,
        };
      });
      const batchResult = await storyDomain.regenerateScenesBatch(
        spec,
        text.scenes.length,
        batchFailedScenes,
        { onUsage: (u) => recordUsage(u, usageContext) }
      );
      const textBySceneId = new Map(batchResult.map((r) => [r.sceneId, r.text]));
      const newTexts = sceneIds.map((id) => {
        const t = textBySceneId.get(id);
        if (t) return t;
        const scene = text.scenes.find((s: any) => s.sceneId === id);
        return scene?.text ?? '';
      });

      // Update only scene text (preserve sceneVisual, environmentId, etc.)
      sceneIds.forEach((sceneId, i) => {
        const idx = text.scenes.findIndex((s: any) => s.sceneId === sceneId);
        if (idx !== -1 && newTexts[i]) {
          text.scenes[idx].text = newTexts[i];
        }
      });

      text.fullText = text.scenes.map((s: any) => s.text).join('\n\n');
      text.wordCount = text.fullText.split(/\s+/).length;

      // Re-validate updated scenes
      const scenesToRevalidate = sceneIds.map((id) => text.scenes.find((s: any) => s.sceneId === id)).filter(Boolean);
      let revalidations: SceneValidationLike[];
      if (scenesToRevalidate.length > 0) {
        const revalBatch = await storyDomain.validateScenesBatch(
          scenesToRevalidate as any[],
          spec.policyProfile,
          spec.scenarioCard?.id,
          { onUsage: (u) => recordUsage(u, usageContext) }
        );
        const revalFailedMap = new Map(revalBatch.failedScenes.map((f) => [f.sceneId, f]));
        revalidations = sceneIds.map((sceneId) => {
          const failed = revalFailedMap.get(sceneId);
          if (failed) {
            return {
              sceneId,
              isValid: false,
              violations: failed.violations,
              correctedCameraComposition: failed.correctedCameraComposition,
            };
          }
          return { sceneId, isValid: true, violations: [] };
        });
      } else {
        revalidations = sceneIds.map((sceneId) => ({ sceneId, isValid: true, violations: [] }));
      }

      // Apply correctedCameraComposition from revalidation if present
      revalidations.forEach((validation, idx) => {
        const sceneId = sceneIds[idx];
        const scene = text.scenes.find((s: any) => s.sceneId === sceneId);
        if (validation.correctedCameraComposition && scene?.sceneVisual) {
          scene.sceneVisual.cameraComposition = validation.correctedCameraComposition;
          logger.info(
            { requestId, sceneId },
            'Applied correctedCameraComposition after revalidation'
          );
        }
      });

      // Update validations for next iteration (scenesToRegenerate logic)
      revalidations.forEach((validation, idx) => {
        const sceneId = sceneIds[idx];
        const valIdx = validations.findIndex((v) => v.sceneId === sceneId);
        if (valIdx >= 0) {
          validations[valIdx] = validation;
        }
        if (validation.isValid) {
          scenesToRegenerate.delete(sceneId);
        } else {
          const hasOther = validation.violations.some((viol: any) => viol.category !== 'camera_composition_incomplete');
          if (validation.correctedCameraComposition && !hasOther) {
            scenesToRegenerate.delete(sceneId);
          } else {
            scenesToRegenerate.set(sceneId, (scenesToRegenerate.get(sceneId) || 0) + 1);
          }
        }
      });
    }

    if (scenesToRegenerate.size > 0) {
      logger.warn({
        requestId,
        failedSceneIds: Array.from(scenesToRegenerate.keys()),
      }, 'Some scenes still failing validation after max retries');
    }
  }

  const validationTimeMs = Date.now() - validationStart;
  await completeTask(requestId, STORY_TASKS.VALIDATING);

  logger.info({ requestId, validationTimeMs, sceneCount: text.scenes.length }, 'Validation completed');

  return {
    validatedText: text,
    validationTimeMs
  };
}
