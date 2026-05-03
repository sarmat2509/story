/**
 * Story validation functions
 */

import { logger } from '../../utils/logger';
import { getStoryDomainService } from '../aiService';
import { recordUsage } from '../aiUsageService';
import { startTask, completeTask, updateTaskProgress, STORY_TASKS } from '../storyProgress';
import { getGenerationCoefficients } from '../generationTimeService';
import {
  hashModerationSubject,
  recordModerationDecision,
} from '../moderationDecisionService';
import config from '../../config';
import type { ValidateParams, ValidateResult } from './types';

type SceneValidationLike = {
  sceneId: number;
  isValid: boolean;
  violations: Array<{ category: string; message: string }>;
  correctedCameraComposition?: {
    shot: string;
    characters: Array<{ name: string; description: string; outfitId?: string }>;
  };
};

function mergeCorrectedCameraComposition(
  existingCameraComposition: unknown,
  corrected: NonNullable<SceneValidationLike['correctedCameraComposition']>,
): NonNullable<SceneValidationLike['correctedCameraComposition']> {
  const existingCharacters =
    existingCameraComposition &&
    typeof existingCameraComposition === 'object' &&
    Array.isArray((existingCameraComposition as { characters?: unknown }).characters)
      ? ((existingCameraComposition as {
          characters: Array<{ name?: string; outfitId?: string }>;
        }).characters ?? [])
      : [];

  const existingOutfits = new Map(
    existingCharacters
      .filter((character) => typeof character?.name === 'string' && typeof character?.outfitId === 'string')
      .map((character) => [character.name!.trim(), character.outfitId!.trim()] as const),
  );

  return {
    shot: corrected.shot,
    characters: corrected.characters.map((character) => ({
      ...character,
      ...(character.outfitId
        ? { outfitId: character.outfitId }
        : existingOutfits.get(character.name.trim())
          ? { outfitId: existingOutfits.get(character.name.trim()) }
          : {}),
    })),
  };
}

function recordFailedSceneValidation(input: {
  requestId: string;
  userId: string;
  storyId?: string;
  validation: SceneValidationLike;
  stage: 'generated_text_validation' | 'generated_text_revalidation' | 'generated_text_validation_final';
  attempt?: number;
}): void {
  const categories = Array.from(new Set(input.validation.violations.map((violation) => violation.category)));
  void recordModerationDecision({
    userId: input.userId,
    storyId: input.storyId,
    storyRequestId: input.requestId,
    stage: input.stage,
    source: 'story_scene_validation',
    subjectType: 'scene',
    subjectRefHash: hashModerationSubject(`${input.requestId}:${input.validation.sceneId}`),
    decision: input.stage === 'generated_text_validation_final' ? 'failed' : 'regenerated',
    code: input.stage === 'generated_text_validation_final'
      ? 'GENERATED_TEXT_VALIDATION_FAILED'
      : 'GENERATED_TEXT_VALIDATION_REGENERATED',
    category: categories.join(',') || undefined,
    metadata: {
      sceneId: input.validation.sceneId,
      attempt: input.attempt,
      violationCount: input.validation.violations.length,
      violationCategories: categories,
    },
  });
}

async function runWithConcurrencyLimit<T, TResult>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, concurrency);
  const results = new Array<TResult>(items.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const p = fn(items[i], i)
      .then((result) => {
        results[i] = result;
      })
      .finally(() => {
        executing.splice(executing.indexOf(p), 1);
      });

    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

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
  const validationConcurrency = config.text.validationConcurrency;
  await startTask(requestId, STORY_TASKS.VALIDATING, {
    estimatedMs: coefficients.avgValidationMsPerScene * (text?.scenes?.length || 6),
    totalScenes: text.scenes.length,
    completedScenes: 0,
    currentSceneId: null,
  });

  let completedValidationUnits = 0;
  let totalValidationUnits = text.scenes.length + 1;

  const reportValidationProgress = async (currentSceneId: number | null): Promise<void> => {
    const ratio = totalValidationUnits > 0 ? completedValidationUnits / totalValidationUnits : 0;
    await updateTaskProgress(
      requestId,
      STORY_TASKS.VALIDATING,
      ratio,
      {
        completedScenes: completedValidationUnits,
        totalScenes: totalValidationUnits,
        currentSceneId,
      },
    );
  };

  logger.info(
    { requestId, sceneCount: text.scenes.length, validationConcurrency },
    'Starting parallel scene validation',
  );
  const initialValidationDurations: number[] = [];
  const validations = await runWithConcurrencyLimit(
    text.scenes,
    validationConcurrency,
    async (scene: any, idx: number): Promise<SceneValidationLike> => {
      const sceneStart = Date.now();
      const isLastScene = idx === text.scenes.length - 1;

      logger.info({ requestId, sceneId: scene.sceneId, isLastScene }, 'Scene validation started');
      const validation = await storyDomain.validateScene(
        scene,
        spec.policyProfile,
        isLastScene,
        spec.scenarioCard?.id,
        { onUsage: (u) => recordUsage(u, usageContext) },
      );
      const durationMs = Date.now() - sceneStart;
      initialValidationDurations.push(durationMs);
      completedValidationUnits += 1;

      logger.info(
        {
          requestId,
          sceneId: scene.sceneId,
          durationMs,
          isValid: validation.isValid,
          violationCount: validation.violations.length,
        },
        'Scene validation completed',
      );

      await reportValidationProgress(scene.sceneId);

      return {
        sceneId: validation.sceneId,
        isValid: validation.isValid,
        violations: validation.violations,
        correctedCameraComposition: validation.correctedCameraComposition,
      };
    },
  );

  // Apply correctedCameraComposition directly (no regeneration needed)
  for (const validation of validations) {
    if (validation.correctedCameraComposition) {
      const scene = text.scenes.find((s: any) => s.sceneId === validation.sceneId);
      if (scene?.sceneVisual) {
        scene.sceneVisual.cameraComposition = mergeCorrectedCameraComposition(
          scene.sceneVisual.cameraComposition,
          validation.correctedCameraComposition,
        );
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
    failedScenes.forEach((validation) => {
      recordFailedSceneValidation({
        requestId,
        userId,
        storyId,
        validation,
        stage: 'generated_text_validation',
      });
    });

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
        totalValidationUnits += scenesToRevalidate.length;
        await reportValidationProgress(null);
        revalidations = await runWithConcurrencyLimit(
          scenesToRevalidate as any[],
          validationConcurrency,
          async (scene: any): Promise<SceneValidationLike> => {
            const sceneStart = Date.now();

            logger.info({ requestId, sceneId: scene.sceneId, attempt: attempt + 1 }, 'Scene revalidation started');
            const validation = await storyDomain.validateScene(
              scene,
              spec.policyProfile,
              scene.sceneId === text.scenes[text.scenes.length - 1]?.sceneId,
              spec.scenarioCard?.id,
              { onUsage: (u) => recordUsage(u, usageContext) },
            );
            const durationMs = Date.now() - sceneStart;
            completedValidationUnits += 1;

            logger.info(
              {
                requestId,
                sceneId: scene.sceneId,
                attempt: attempt + 1,
                durationMs,
                isValid: validation.isValid,
                violationCount: validation.violations.length,
              },
              'Scene revalidation completed',
            );

            await reportValidationProgress(scene.sceneId);

            return {
              sceneId: validation.sceneId,
              isValid: validation.isValid,
              violations: validation.violations,
              correctedCameraComposition: validation.correctedCameraComposition,
            };
          },
        );
      } else {
        revalidations = sceneIds.map((sceneId) => ({ sceneId, isValid: true, violations: [] }));
      }

      // Apply correctedCameraComposition from revalidation if present
      revalidations.forEach((validation, idx) => {
        const sceneId = sceneIds[idx];
        const scene = text.scenes.find((s: any) => s.sceneId === sceneId);
        if (validation.correctedCameraComposition && scene?.sceneVisual) {
          scene.sceneVisual.cameraComposition = mergeCorrectedCameraComposition(
            scene.sceneVisual.cameraComposition,
            validation.correctedCameraComposition,
          );
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
          recordFailedSceneValidation({
            requestId,
            userId,
            storyId,
            validation,
            stage: 'generated_text_revalidation',
            attempt: attempt + 1,
          });
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
      const finalFailedSceneIds = Array.from(scenesToRegenerate.keys());
      const finalFailures = finalFailedSceneIds.map((sceneId) => {
        const validation = validations.find((v) => v.sceneId === sceneId);
        return {
          sceneId,
          categories: validation?.violations.map((violation) => violation.category) ?? [],
        };
      });

      logger.warn({
        requestId,
        failedSceneIds: finalFailedSceneIds,
        failures: finalFailures,
      }, 'Some scenes still failing validation after max retries');

      finalFailedSceneIds.forEach((sceneId) => {
        const validation = validations.find((candidate) => candidate.sceneId === sceneId);
        if (validation) {
          recordFailedSceneValidation({
            requestId,
            userId,
            storyId,
            validation,
            stage: 'generated_text_validation_final',
            attempt: maxRetries,
          });
        }
      });

      throw new Error(
        `Story text validation failed after safety retries for ${finalFailedSceneIds.length} scene(s). Please try again with a gentler idea.`
      );
    }
  }

  const validationTimeMs = Date.now() - validationStart;
  await completeTask(requestId, STORY_TASKS.VALIDATING);

  const maxSceneMs = initialValidationDurations.length > 0
    ? Math.max(...initialValidationDurations)
    : 0;
  const avgSceneMs = initialValidationDurations.length > 0
    ? Math.round(initialValidationDurations.reduce((sum, ms) => sum + ms, 0) / initialValidationDurations.length)
    : 0;

  logger.info(
    {
      requestId,
      validationTimeMs,
      sceneCount: text.scenes.length,
      validationConcurrency,
      avgSceneMs,
      maxSceneMs,
      failedCount: failedScenes.length,
    },
    'Validation completed',
  );

  return {
    validatedText: text,
    validationTimeMs
  };
}
