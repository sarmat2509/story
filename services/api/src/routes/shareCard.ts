/**
 * Share-card image routes (og:image 1200×630)
 * GET /share-card/:slug - Public story
 * GET /share-card/u/:token - Unlisted story
 */

import { Router, Request, Response } from 'express';
import {
  getStoryForShareCard,
  getShareCardImageBuffer,
} from '../services/publicStoryService';
import { logger } from '../utils/logger';

const router = Router();

const CACHE_MAX_AGE = 86400; // 24 hours

async function handleShareCard(
  req: Request,
  res: Response,
  slugOrToken: string,
  isUnlisted: boolean
): Promise<void> {
  try {
    const story = await getStoryForShareCard(slugOrToken, isUnlisted);
    if (!story) {
      res.status(404).send('Not found');
      return;
    }

    const buffer = await getShareCardImageBuffer(story, slugOrToken, isUnlisted);
    if (!buffer) {
      res.status(404).send('No image');
      return;
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`);
    res.send(buffer);
  } catch (error: unknown) {
    logger.error(
      { err: error, slugOrToken, isUnlisted },
      'Share-card image failed'
    );
    res.status(500).send('Internal server error');
  }
}

/**
 * GET /share-card/u/:token
 * Unlisted story share-card image. Must be before /:slug to avoid slug="u".
 */
router.get('/u/:token', async (req: Request, res: Response) => {
  const token = req.params['token'];
  if (typeof token !== 'string' || !token) {
    res.status(400).send('Bad request');
    return;
  }
  await handleShareCard(req, res, token, true);
});

/**
 * GET /share-card/:slug
 * Public story share-card image.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  const slug = req.params['slug'];
  if (typeof slug !== 'string' || !slug) {
    res.status(400).send('Bad request');
    return;
  }
  await handleShareCard(req, res, slug, false);
});

export default router;
