import { Router, Request, Response } from 'express';
import { CreateStoryRequestSchema } from '@wondertales/shared';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import { expensiveGenerationLimiter } from '../middleware/rateLimiter';
import { requireGenerationAvailable } from '../middleware/maintenanceMiddleware';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import { createMixedStoryRequest } from '../services/graphicNovelOrchestrationService';
import { enforceUserJobLimit } from '../services/storyOrchestrationService';
import {
  isStoryQuotaError,
  releaseStoryQuotaReservationForRequest,
} from '../services/storyQuotaService';
import { isPromptSafetyError } from '../services/promptSafetyService';
import { isMixedStoryAccessError } from '../services/mixedStoryAccessService';
import { logger } from '../utils/logger';
import { isStoryCharacterSelectionLimitError } from '../services/storyCharacterSelectionLimitService';

const router = Router();

async function releaseStoryQuotaReservationOnCreateFailure(
  requestId: string | undefined,
  error: unknown
): Promise<void> {
  if (!requestId) return;
  try {
    await releaseStoryQuotaReservationForRequest(requestId, {
      reason: 'queue_enqueue_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } catch (releaseError) {
    logger.error(
      { err: releaseError, requestId },
      'Failed to release story quota after mixed story create failure'
    );
  }
}

function sendPromptSafetyError(res: Response, error: unknown): boolean {
  if (!isPromptSafetyError(error)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    message: error.message,
    category: error.category,
    source: error.source,
  });
  return true;
}

function sendStoryQuotaError(res: Response, error: unknown): boolean {
  if (!isStoryQuotaError(error)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    message: error.message,
    featureSlug: error.featureSlug,
    limit: error.limit,
    used: error.used,
    remaining: error.remaining,
    resetsAt: error.resetsAt?.toISOString() ?? null,
  });
  return true;
}

function sendStoryCharacterSelectionLimitError(res: Response, error: unknown): boolean {
  if (!isStoryCharacterSelectionLimitError(error)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    message: error.message,
    featureSlug: error.featureSlug,
    limit: error.limit,
    selected: error.selected,
    imagesPerStory: error.imagesPerStory,
  });
  return true;
}

function sendMixedStoryAccessError(res: Response, error: unknown): boolean {
  if (!isMixedStoryAccessError(error)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    message: error.message,
    featureSlug: error.featureSlug,
    limit: error.limit,
  });
  return true;
}

router.post(
  '/',
  requireAuth,
  requireParentSession,
  requireGenerationAvailable,
  expensiveGenerationLimiter,
  async (req: Request, res: Response) => {
    let requestId: string | undefined;
    let queued = false;

    try {
      const validatedData = CreateStoryRequestSchema.parse(req.body);

      try {
        await enforceUserJobLimit(req.user!.id);
      } catch (limitError) {
        return res.status(429).json({
          status: 'error',
          message: (limitError as Error).message,
        });
      }

      requestId = await createMixedStoryRequest(req.user!.id, validatedData);
      const jobId = await storyJobQueue.addJob(requestId);
      queued = true;

      logger.info(
        {
          userId: req.user!.id,
          requestId,
          jobId,
          language: validatedData.storyLanguage,
        },
        'Mixed story request created'
      );

      res.status(201).json({
        status: 'success',
        request: {
          id: requestId,
          status: 'pending',
          progress: 0,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (!queued) {
        await releaseStoryQuotaReservationOnCreateFailure(requestId, error);
      }
      if (sendPromptSafetyError(res, error)) return;
      if (sendStoryQuotaError(res, error)) return;
      if (sendStoryCharacterSelectionLimitError(res, error)) return;
      if (sendMixedStoryAccessError(res, error)) return;

      logger.error({ err: error, userId: req.user?.id }, 'Create mixed story request failed');

      if (error instanceof Error && 'issues' in error) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid request data',
          errors: (error as any).issues,
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Failed to create mixed story',
      });
    }
  }
);

export default router;
