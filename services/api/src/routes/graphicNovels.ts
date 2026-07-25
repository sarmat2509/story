import { Router, Request, Response } from 'express';
import { CreateStoryRequestSchema } from '@wondertales/shared';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import { expensiveGenerationLimiter } from '../middleware/rateLimiter';
import { requireGenerationAvailable } from '../middleware/maintenanceMiddleware';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import {
  createGraphicNovelRequest,
  getGraphicNovel,
  getGraphicNovelGenerationStatus,
} from '../services/graphicNovelOrchestrationService';
import { enforceUserJobLimit } from '../services/storyOrchestrationService';
import {
  isStoryQuotaError,
  releaseStoryQuotaReservationForRequest,
} from '../services/storyQuotaService';
import { isPromptSafetyError } from '../services/promptSafetyService';
import {
  isGraphicNovelQuotaError,
  releaseGraphicNovelQuotaReservationForRequest,
} from '../services/graphicNovelQuotaService';
import { logger } from '../utils/logger';
import { isStoryCharacterSelectionLimitError } from '../services/storyCharacterSelectionLimitService';
import {
  assertParentStoryChildProfile,
  isStoryChildProfileRequirementError,
} from '../services/storyChildProfileRequirementService';

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
      'Failed to release story quota after graphic novel create failure'
    );
  }
}

async function releaseGraphicNovelQuotaReservationOnCreateFailure(
  requestId: string | undefined,
  error: unknown
): Promise<void> {
  if (!requestId) return;
  try {
    await releaseGraphicNovelQuotaReservationForRequest(requestId, {
      reason: 'queue_enqueue_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } catch (releaseError) {
    logger.error(
      { err: releaseError, requestId },
      'Failed to release graphic novel quota after create failure'
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

function sendGraphicNovelQuotaError(res: Response, error: unknown): boolean {
  if (!isGraphicNovelQuotaError(error)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    message: error.message,
    featureSlug: 'graphic_novels_per_month',
    limit: error.details.limit,
    used: error.details.used,
  });
  return true;
}

function sendStoryChildProfileRequirementError(res: Response, error: unknown): boolean {
  if (!isStoryChildProfileRequirementError(error)) return false;
  res.status(error.statusCode).json({
    status: 'error',
    code: error.code,
    message: error.message,
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

      await assertParentStoryChildProfile(req.user!.id, validatedData.childProfileId);

      try {
        await enforceUserJobLimit(req.user!.id);
      } catch (limitError) {
        return res.status(429).json({
          status: 'error',
          message: (limitError as Error).message,
        });
      }

      requestId = await createGraphicNovelRequest(req.user!.id, validatedData);
      const jobId = await storyJobQueue.addJob(requestId);
      queued = true;

      logger.info(
        {
          userId: req.user!.id,
          requestId,
          jobId,
          language: validatedData.storyLanguage,
        },
        'Graphic novel request created'
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
        await Promise.all([
          releaseStoryQuotaReservationOnCreateFailure(requestId, error),
          releaseGraphicNovelQuotaReservationOnCreateFailure(requestId, error),
        ]);
      }
      if (sendPromptSafetyError(res, error)) return;
      if (sendStoryQuotaError(res, error)) return;
      if (sendStoryCharacterSelectionLimitError(res, error)) return;
      if (sendGraphicNovelQuotaError(res, error)) return;
      if (sendStoryChildProfileRequirementError(res, error)) return;

      logger.error({ err: error, userId: req.user?.id }, 'Create graphic novel request failed');

      if (error instanceof Error && 'issues' in error) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid request data',
          errors: (error as any).issues,
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Failed to create graphic novel',
      });
    }
  }
);

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await getGraphicNovel(req.params.id, req.user!.id);
    if (!result) {
      return res.status(404).json({
        status: 'error',
        message: 'Graphic novel not found',
      });
    }

    res.json({
      status: 'success',
      graphicNovel: result,
    });
  } catch (error) {
    logger.error(
      { err: error, userId: req.user?.id, storyId: req.params.id },
      'Get graphic novel failed'
    );
    res.status(500).json({
      status: 'error',
      message: 'Failed to get graphic novel',
    });
  }
});

router.get('/:id/generation-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const status = await getGraphicNovelGenerationStatus(req.params.id, req.user!.id);
    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: 'Graphic novel not found',
      });
    }

    res.json({
      status: 'success',
      generationStatus: status,
    });
  } catch (error) {
    logger.error(
      { err: error, userId: req.user?.id, storyId: req.params.id },
      'Get graphic novel generation status failed'
    );
    res.status(500).json({
      status: 'error',
      message: 'Failed to get graphic novel generation status',
    });
  }
});

export default router;
