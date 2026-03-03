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
  const { requestId, text, outline, spec, maxRetries = 2 } = params;
  
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
        outline.scenes[idx],
        scene,
        spec.policyProfile,
        idx === text.scenes.length - 1, // isLastScene
        spec.scenarioCard?.id
      )
    )
  );

  // Check which scenes failed
  const failedScenes = validations.filter(v => !v.isValid);

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

      const regenerationPromises = Array.from(scenesToRegenerate.keys()).map(sceneId => {
        const validation = validations.find(v => v.sceneId === sceneId);
        const feedback = validation?.violations.map((v: any) => v.message).join('; ') || '';
        return storyDomain.regenerateScene(spec, outline, sceneId, feedback);
      });

      const newScenes = await Promise.all(regenerationPromises);

      // Replace regenerated scenes
      newScenes.forEach(newScene => {
        const idx = text.scenes.findIndex((s: any) => s.sceneId === newScene.sceneId);
        if (idx !== -1) {
          text.scenes[idx] = newScene;
        }
      });

      text.fullText = text.scenes.map((s: any) => s.text).join('\n\n');
      text.wordCount = text.fullText.split(/\s+/).length;

      // Re-validate
      const revalidations = await Promise.all(
        newScenes.map((scene, _idx) => {
          const sceneIdx = text.scenes.findIndex((s: any) => s.sceneId === scene.sceneId);
          return storyDomain.validateScene(
            outline.scenes[sceneIdx],
            scene,
            spec.policyProfile,
            sceneIdx === text.scenes.length - 1,
            spec.scenarioCard?.id
          );
        })
      );

      revalidations.forEach((validation, idx) => {
        const sceneId = newScenes[idx].sceneId;
        if (validation.isValid) {
          scenesToRegenerate.delete(sceneId);
        } else {
          scenesToRegenerate.set(sceneId, (scenesToRegenerate.get(sceneId) || 0) + 1);
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
