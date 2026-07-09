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
import type {
  TextValidationAttemptPhase,
  TextValidationAttemptRecord,
  TextValidationSummary,
  ValidateParams,
  ValidateResult,
} from './types';

type SceneValidationLike = {
  sceneId: number;
  isValid: boolean;
  violations: Array<{ category: string; message: string }>;
  validationScore?: number | null;
  requestManifest?: Record<string, unknown>;
  correctedCameraComposition?: {
    shot: string;
    characters: Array<{ name: string; description: string; outfitId?: string }>;
  };
};

const CAMERA_COMPOSITION_COMPLETENESS_CATEGORY = 'camera_composition_incomplete';

function normalizeSceneValidation(validation: SceneValidationLike): SceneValidationLike {
  const ignoredViolations = validation.violations.filter(
    (violation) => violation.category === CAMERA_COMPOSITION_COMPLETENESS_CATEGORY,
  );
  const violations = validation.violations.filter(
    (violation) => violation.category !== CAMERA_COMPOSITION_COMPLETENESS_CATEGORY,
  );

  if (ignoredViolations.length > 0 || validation.correctedCameraComposition) {
    logger.info(
      {
        sceneId: validation.sceneId,
        ignoredViolationCount: ignoredViolations.length,
        ignoredCorrectedCameraComposition: Boolean(validation.correctedCameraComposition),
      },
      'Ignoring camera composition completeness result from text validation',
    );
  }

  return {
    sceneId: validation.sceneId,
    isValid:
      violations.length === 0 &&
      (validation.isValid || ignoredViolations.length > 0 || Boolean(validation.correctedCameraComposition)),
    violations,
    validationScore: scoreTextSceneValidation({
      isValid:
        violations.length === 0 &&
        (validation.isValid || ignoredViolations.length > 0 || Boolean(validation.correctedCameraComposition)),
      violations,
    }),
    requestManifest: validation.requestManifest,
  };
}

function scoreTextSceneValidation(validation: Pick<SceneValidationLike, 'isValid' | 'violations'>): number {
  if (validation.isValid && validation.violations.length === 0) {
    return 100;
  }
  if (!validation.isValid && validation.violations.length === 0) {
    return 0;
  }

  const penaltyBySeverity: Record<string, number> = {
    critical: 100,
    high: 60,
    medium: 35,
  };
  const penalty = validation.violations.reduce((sum, violation) => {
    const severity = typeof (violation as any).severity === 'string' ? (violation as any).severity : '';
    return sum + (penaltyBySeverity[severity] ?? 45);
  }, 0);
  return Math.max(0, 100 - penalty);
}

function validationResultWithoutDebugFields(validation: unknown): unknown {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
    return validation;
  }
  const { requestManifest, ...rest } = validation as Record<string, unknown>;
  return rest;
}

function buildTextValidationAttempt(input: {
  validation: SceneValidationLike;
  rawValidation: unknown;
  phase: TextValidationAttemptPhase;
  attempt: number;
  durationMs: number;
}): TextValidationAttemptRecord {
  const score = input.validation.validationScore ?? scoreTextSceneValidation(input.validation);
  return {
    sceneId: input.validation.sceneId,
    attempt: input.attempt,
    phase: input.phase,
    durationMs: input.durationMs,
    isValid: input.validation.isValid,
    score,
    result: {
      sceneId: input.validation.sceneId,
      isValid: input.validation.isValid,
      violations: input.validation.violations,
    },
    rawResult: validationResultWithoutDebugFields(input.rawValidation),
    rawManifest: input.validation.requestManifest ?? null,
  };
}

function buildTextValidationSummary(input: {
  validations: SceneValidationLike[];
  attempts: TextValidationAttemptRecord[];
  validationTimeMs: number;
  sceneCount: number;
}): TextValidationSummary {
  const failedSceneIds = input.validations
    .filter((validation) => !validation.isValid)
    .map((validation) => validation.sceneId);
  const passedSceneIds = input.validations
    .filter((validation) => validation.isValid)
    .map((validation) => validation.sceneId);
  const finalScores = input.validations.map(
    (validation) => validation.validationScore ?? scoreTextSceneValidation(validation)
  );
  const score = finalScores.length > 0
    ? Math.round(finalScores.reduce((sum, value) => sum + value, 0) / finalScores.length)
    : 0;

  return {
    version: 1,
    status: failedSceneIds.length === 0 ? 'passed' : 'failed',
    score,
    sceneCount: input.sceneCount,
    attemptCount: input.attempts.length,
    validationTimeMs: input.validationTimeMs,
    passedSceneIds,
    failedSceneIds,
    attempts: input.attempts,
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
 * Validate story prose scenes with retry logic
 * Used by both standard and continuation flows
 */
export async function validateStoryTextScenes(params: ValidateParams): Promise<ValidateResult> {
  const { requestId, userId, storyId, text, spec, maxRetries = 2 } = params;
  const usageContext = { userId, storyId };
  const scenes = Array.isArray(text?.scenes) ? text.scenes : [];
  const hasReadableScene = scenes.some(
    (scene: any) => typeof scene?.text === 'string' && scene.text.trim().length > 0,
  );

  if (!text?.fullText?.trim() || scenes.length === 0 || !hasReadableScene) {
    throw new Error('Story text validation cannot run without readable scenes');
  }

  const storyDomain = getStoryDomainService();
  const coefficients = await getGenerationCoefficients();

  const validationStart = Date.now();
  const validationConcurrency = config.text.validationConcurrency;
  const validationAttempts: TextValidationAttemptRecord[] = [];
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
        {
          onUsage: (u) => recordUsage(u, usageContext),
          reservedCharacters: spec.characters,
          operation: 'writer_text_validation',
        },
      );
      const durationMs = Date.now() - sceneStart;
      initialValidationDurations.push(durationMs);
      completedValidationUnits += 1;
      const normalizedValidation = normalizeSceneValidation({
        sceneId: validation.sceneId,
        isValid: validation.isValid,
        violations: validation.violations,
        validationScore: validation.validationScore,
        requestManifest: validation.requestManifest,
        correctedCameraComposition: (validation as any).correctedCameraComposition,
      });
      validationAttempts.push(buildTextValidationAttempt({
        validation: normalizedValidation,
        rawValidation: validation,
        phase: 'initial',
        attempt: 1,
        durationMs,
      }));

      logger.info(
        {
          requestId,
          sceneId: scene.sceneId,
          durationMs,
          isValid: normalizedValidation.isValid,
          violationCount: normalizedValidation.violations.length,
        },
        'Scene validation completed',
      );

      await reportValidationProgress(scene.sceneId);

      return normalizedValidation;
    },
  );

  const failedScenes = validations.filter((v) => !v.isValid);

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

      // Update only scene prose; any non-text metadata on the caller's scene object is left untouched.
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
              {
                onUsage: (u) => recordUsage(u, usageContext),
                reservedCharacters: spec.characters,
                operation: 'writer_text_validation',
              },
            );
            const durationMs = Date.now() - sceneStart;
            completedValidationUnits += 1;
            const normalizedValidation = normalizeSceneValidation({
              sceneId: validation.sceneId,
              isValid: validation.isValid,
              violations: validation.violations,
              validationScore: validation.validationScore,
              requestManifest: validation.requestManifest,
              correctedCameraComposition: (validation as any).correctedCameraComposition,
            });
            validationAttempts.push(buildTextValidationAttempt({
              validation: normalizedValidation,
              rawValidation: validation,
              phase: 'revalidation',
              attempt: attempt + 2,
              durationMs,
            }));

            logger.info(
              {
                requestId,
                sceneId: scene.sceneId,
                attempt: attempt + 1,
                durationMs,
                isValid: normalizedValidation.isValid,
                violationCount: normalizedValidation.violations.length,
              },
              'Scene revalidation completed',
            );

            await reportValidationProgress(scene.sceneId);

            return normalizedValidation;
          },
        );
      } else {
        revalidations = sceneIds.map((sceneId) => ({ sceneId, isValid: true, violations: [] }));
      }

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
          scenesToRegenerate.set(sceneId, (scenesToRegenerate.get(sceneId) || 0) + 1);
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

  const textValidation = buildTextValidationSummary({
    validations,
    attempts: validationAttempts,
    validationTimeMs,
    sceneCount: text.scenes.length,
  });

  return {
    validatedText: text,
    validationTimeMs,
    textValidation,
  };
}

/** @deprecated Use validateStoryTextScenes to make the prose-only boundary explicit. */
export const validateStoryScenes = validateStoryTextScenes;
