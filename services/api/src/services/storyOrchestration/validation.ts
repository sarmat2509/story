/**
 * Story validation functions
 */

import { logger } from '../../utils/logger';
import { getStoryDomainService } from '../aiService';
import { startTask, completeTask, STORY_TASKS } from '../storyProgress';
import { getGenerationCoefficients } from '../generationTimeService';
import type { ValidateParams, ValidateResult } from './types';

/**
 * Validate story scenes with retry logic
 * Used by both standard and continuation flows
 */
export async function validateStoryScenes(params: ValidateParams): Promise<ValidateResult> {
  const { requestId, text, spec, maxRetries = 2 } = params;
  
  const storyDomain = getStoryDomainService();
  const coefficients = await getGenerationCoefficients();
  
  const validationStart = Date.now();
  await startTask(requestId, STORY_TASKS.VALIDATING, {
    estimatedMs: coefficients.avgValidationMsPerScene * (text?.scenes?.length || 6),
  });

  logger.info({ requestId, sceneCount: text.scenes.length }, 'Starting parallel scene validation');

  const validations = await Promise.all(
    text.scenes.map((scene: any, idx: number) =>
      storyDomain.validateScene(
        scene,
        spec.policyProfile,
        idx === text.scenes.length - 1, // isLastScene
        spec.scenarioCard?.id
      )
    )
  );

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
  const hasOtherViolations = (v: (typeof validations)[0]) =>
    v.violations.some((viol: any) => viol.category !== 'camera_composition_incomplete');
  const failedScenes = validations.filter(
    v => !v.isValid && (!v.correctedCameraComposition || hasOtherViolations(v))
  );

  if (failedScenes.length > 0) {
    logger.info({ 
      requestId, 
      failedCount: failedScenes.length,
      sceneIds: failedScenes.map(f => f.sceneId)
    }, 'Some scenes failed validation, starting regeneration');

    // SELECTIVE REGENERATION WITH RETRY LOOP
    const scenesToRegenerate = new Map(failedScenes.map(f => [f.sceneId, 0]));

    for (let attempt = 0; attempt < maxRetries && scenesToRegenerate.size > 0; attempt++) {
      logger.info({ 
        requestId, 
        attempt: attempt + 1, 
        scenesToRegenerate: Array.from(scenesToRegenerate.keys())
      }, 'Regeneration attempt');

      const sceneIds = Array.from(scenesToRegenerate.keys());
      const regenerationPromises = sceneIds.map(sceneId => {
        const scene = text.scenes.find((s: any) => s.sceneId === sceneId);
        const validation = validations.find(v => v.sceneId === sceneId);
        const feedback = validation?.violations.map((v: any) => v.message).join('; ') || '';
        return storyDomain.regenerateScene(spec, text.scenes.length, sceneId, scene?.text ?? '', feedback);
      });

      const newTexts = await Promise.all(regenerationPromises);

      // Update only scene text (preserve sceneVisual, environmentId, etc.)
      sceneIds.forEach((sceneId, i) => {
        const idx = text.scenes.findIndex((s: any) => s.sceneId === sceneId);
        if (idx !== -1) {
          text.scenes[idx].text = newTexts[i];
        }
      });

      text.fullText = text.scenes.map((s: any) => s.text).join('\n\n');
      text.wordCount = text.fullText.split(/\s+/).length;

      // Re-validate updated scenes
      const revalidations = await Promise.all(
        sceneIds.map((sceneId) => {
          const idx = text.scenes.findIndex((s: any) => s.sceneId === sceneId);
          const scene = text.scenes[idx];
          return storyDomain.validateScene(
            scene,
            spec.policyProfile,
            idx === text.scenes.length - 1,
            spec.scenarioCard?.id
          );
        })
      );

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

      revalidations.forEach((validation, idx) => {
        const sceneId = sceneIds[idx];
        if (validation.isValid) {
          scenesToRegenerate.delete(sceneId);
        } else {
          const hasOther = validation.violations.some((viol: any) => viol.category !== 'camera_composition_incomplete');
          if (validation.correctedCameraComposition && !hasOther) {
            scenesToRegenerate.delete(sceneId); // Fixed by correctedCameraComposition
          } else {
            scenesToRegenerate.set(sceneId, (scenesToRegenerate.get(sceneId) || 0) + 1);
          }
        }
      });
    }

    if (scenesToRegenerate.size > 0) {
      logger.warn({ 
        requestId, 
        failedSceneIds: Array.from(scenesToRegenerate.keys())
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
