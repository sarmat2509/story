import { Router, Request, Response } from 'express';
import { getPublicAuthorById, listPublicStories } from '../services/publicStoryService';
import { logger } from '../utils/logger';

const router = Router();

router.get('/:authorId', async (req: Request, res: Response) => {
  try {
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
