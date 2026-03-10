/**
 * Me Stories API
 * GET /api/v1/me/stories - List current user's stories
 * GET /api/v1/me/stories/:id - Get single story (owner only)
 * GET /api/v1/me/stories/:id/alignment - Get alignment (owner only)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getStory, getStoryManifest, listUserStories, listUserStorySummaries, getTotalUserStoriesCount } from '../services/storyOrchestrationService';
import { getAlignmentRepository } from '../repositories';
import { stripAllTags } from '../utils/audioTags';
import { logger } from '../utils/logger';

function parseSceneVisual(scene: any): { sceneVisual?: any; visualPrompt?: string } {
  const vp = scene.visualPrompt;
  if (!vp) return {};
  if (typeof vp === 'string' && vp.startsWith('{')) {
    try {
      const parsed = JSON.parse(vp);
      if (parsed && typeof parsed.setting === 'string' && parsed.cameraComposition !== undefined) {
        return { sceneVisual: parsed };
      }
    } catch (_) {
      // Not valid JSON — fall through to legacy
    }
  }
  return { visualPrompt: stripAllTags(vp) };
}

const router = Router();

/**
 * GET /api/v1/me/stories
 * List current user's stories. Requires auth.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
    // caseTransformMiddleware converts query params to camelCase (has_audio → hasAudio, scenario_card_id → scenarioCardId)
    const hasAudio = req.query.hasAudio === 'true' || req.query.hasAudio === '1';
    const scenarioCardId = typeof req.query.scenarioCardId === 'string' ? req.query.scenarioCardId : undefined;
    const seriesId = typeof req.query.seriesId === 'string' ? req.query.seriesId : undefined;
    const view = req.query.view as string | undefined;

    const totalCount = await getTotalUserStoriesCount(req.user!.id, { hasAudio, scenarioCardId, seriesId });

    if (view === 'summary') {
      const summaries = await listUserStorySummaries(req.user!.id, {
        limit,
        offset,
        hasAudio,
        scenarioCardId,
        seriesId,
      });
      return res.json({
        status: 'success',
        stories: summaries,
        pagination: { limit, offset, total: totalCount },
      });
    }

    const stories = await listUserStories(req.user!.id, { limit, offset, hasAudio, scenarioCardId, seriesId });

    const storyForClient = stories.map((story: any) => ({
      ...story,
      scenes: Array.isArray(story.scenes) ? story.scenes.map((scene: any) => ({
        ...scene,
        text: stripAllTags(scene.text || ''),
        ...parseSceneVisual(scene),
      })) : story.scenes,
      fullText: stripAllTags(story.fullText || ''),
    }));

    res.json({
      status: 'success',
      stories: storyForClient,
      pagination: { limit, offset, total: totalCount },
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List my stories failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list stories',
    });
  }
});

/**
 * GET /api/v1/me/stories/:id/alignment
 * Get alignment for a story. Requires auth + ownership.
 */
router.get('/:id/alignment', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const story = await getStory(id, req.user!.id);

    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const alignmentRepo = getAlignmentRepository();
    const row = await alignmentRepo.findByStoryId(id);
    const alignment = row?.data ?? (story.audioMetadata as any)?.alignment;

    if (!alignment) {
      return res.status(404).json({
        status: 'error',
        message: 'Alignment not found',
      });
    }

    res.json({
      status: 'success',
      alignment,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Get my story alignment failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get alignment',
    });
  }
});

/**
 * GET /api/v1/me/stories/:id
 * Get a single story (manifest format for viewer). Requires auth + ownership.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const story = await getStory(id, req.user!.id);

    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const manifest = await getStoryManifest(id);

    res.json({
      status: 'success',
      manifest,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Get my story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get story',
    });
  }
});

export default router;
