import { Router, Request, Response } from 'express';
import { getPublicAuthorById, listPublicStories } from '../services/publicStoryService';
import { optionalAuth } from '../middleware/authMiddleware';
import { getChildProfileRepository } from '../repositories';
import { buildChildModeControls } from '../services/childModeControlsService';
import { logger } from '../utils/logger';

const router = Router();

async function rejectIfPublicStoriesDisabled(req: Request, res: Response): Promise<boolean> {
  if (req.sessionMode !== 'child') return false;
  const childProfileId = req.childProfileId;
  const parentUserId = req.parentUserId || req.user?.id;
  if (!childProfileId || !parentUserId) {
    res.status(403).json({
      status: 'error',
      code: 'CHILD_PUBLIC_STORIES_DISABLED',
      message: 'Public stories are disabled in Child Mode',
    });
    return true;
  }
  const profile = await getChildProfileRepository().findById(childProfileId, parentUserId);
  if (!profile || !buildChildModeControls(profile).childModeSettings.publicStoriesEnabled) {
    res.status(403).json({
      status: 'error',
      code: 'CHILD_PUBLIC_STORIES_DISABLED',
      message: 'Public stories are disabled in Child Mode',
    });
    return true;
  }
  return false;
}

router.get('/:authorId', optionalAuth, async (req: Request, res: Response) => {
  try {
    if (await rejectIfPublicStoriesDisabled(req, res)) return;
    const { authorId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || '24'), 10) || 24, 50);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

    const author = await getPublicAuthorById(authorId);
    if (!author) {
      return res.status(404).json({
        status: 'error',
        message: 'Author not found',
      });
    }

    const { items, total } = await listPublicStories({ limit, offset, authorId });

    res.json({
      status: 'success',
      author,
      stories: items,
      pagination: { limit, offset, total },
    });
  } catch (error) {
    logger.error({ err: error, authorId: req.params.authorId }, 'Get public author failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get author',
    });
  }
});

export default router;
