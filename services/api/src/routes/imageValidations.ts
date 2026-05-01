import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../middleware/authMiddleware';
import {
  listAllImageValidations,
  listImageValidationsForStory,
} from '../services/imageValidationQueryService';
import { logger } from '../utils/logger';

const router = Router();

const ListQuerySchema = z.object({
  storyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function rowToDto(row: {
  id: string;
  storyId: string;
  sceneIndex: number;
  attempt: number;
  imageStoragePath: string;
  validationScore: number;
  visionModel: string | null;
  result: unknown;
  createdAt: Date;
}) {
  return {
    id: row.id,
    storyId: row.storyId,
    sceneIndex: row.sceneIndex,
    attempt: row.attempt,
    imageStoragePath: row.imageStoragePath,
    imageUrl: `/api/v1/assets/${row.imageStoragePath}`,
    validationScore: row.validationScore,
    visionModel: row.visionModel,
    result: row.result,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * GET /api/v1/image-validations?story_id=&limit=&offset=
 * Admin-only debug/moderation endpoint. User-facing flows should not expose
 * raw image validation internals.
 */
router.get('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid query',
        details: parsed.error.flatten(),
      });
    }

    const { storyId, limit, offset } = parsed.data;
    if (storyId) {
      const { items, total } = await listImageValidationsForStory(storyId, limit, offset);
      return res.json({
        status: 'success',
        data: {
          items: items.map(rowToDto),
          meta: { limit, offset, total },
        },
      });
    }

    const { items, total } = await listAllImageValidations(limit, offset);
    return res.json({
      status: 'success',
      data: {
        items: items.map(rowToDto),
        meta: { limit, offset, total },
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List image validations failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list image validations',
    });
  }
});

export default router;
