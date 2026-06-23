/**
 * Me Stories API
 * GET /api/v1/me/stories - List current user's stories
 * GET /api/v1/me/stories/languages - Distinct language codes (≥1 story each)
 * GET /api/v1/me/stories/:id - Get single story (owner only)
 * GET /api/v1/me/stories/:id/alignment - Get alignment (owner only)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
  getStory,
  getStoryManifest,
  listUserStories,
  listUserStorySummaries,
  getTotalUserStoriesCount,
  listUserStoryLanguages,
} from '../services/storyOrchestrationService';
import { getAlignmentRepository, getStoryRepository } from '../repositories';
import {
  canReadStoryForSession,
  getChildScopedStoryFilter,
} from '../services/childStoryAccessService';
import {
  StoryQuizServiceError,
  generateStoryQuiz,
  getStoryQuizCandidateForProgress,
  getStoryQuiz,
  saveStoryQuizAnswer,
} from '../services/storyQuizService';
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

function parseLanguageQuery(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 10) {
    return undefined;
  }
  return raw;
}

function getStoryReadOptions(req: Request): { childProfileId?: string } {
  const childProfileId = getChildScopedStoryFilter({
    sessionMode: req.sessionMode,
    childProfileId: req.childProfileId,
    sessionScopes: req.sessionScopes,
  });
  return childProfileId ? { childProfileId } : {};
}

async function findReadableStoryForRequest(req: Request, storyId: string) {
  const story = await getStoryRepository().findByIdAndUser(storyId, req.user!.id);
  if (!story) {
    return null;
  }
  if (!canReadStoryForSession(req, story)) {
    return null;
  }
  return story;
}

function childSessionCanUseQuizzes(req: Request): boolean {
  return req.sessionMode !== 'child' || Boolean(req.sessionScopes?.includes('story:quiz'));
}

function sendStoryQuizError(res: Response, error: unknown) {
  if (error instanceof StoryQuizServiceError) {
    return res.status(error.statusCode).json({
      status: 'error',
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

/**
 * GET /api/v1/me/stories/languages
 * Distinct language codes for stories the user owns (at least one story per code).
 */
router.get('/languages', requireAuth, async (req: Request, res: Response) => {
  try {
    const languages = await listUserStoryLanguages(req.user!.id, getStoryReadOptions(req));
    return res.json({
      status: 'success',
      languages,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List user story languages failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to list languages',
    });
  }
});

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
    const language = parseLanguageQuery(req.query.language);
    const view = req.query.view as string | undefined;

    const storyReadOptions = getStoryReadOptions(req);
    const totalCount = await getTotalUserStoriesCount(req.user!.id, {
      ...storyReadOptions,
      hasAudio,
      scenarioCardId,
      seriesId,
      language,
    });

    if (view === 'summary') {
      const summaries = await listUserStorySummaries(req.user!.id, {
        ...storyReadOptions,
        limit,
        offset,
        hasAudio,
        scenarioCardId,
        seriesId,
        language,
      });
      return res.json({
        status: 'success',
        stories: summaries,
        pagination: { limit, offset, total: totalCount },
      });
    }

    const stories = await listUserStories(req.user!.id, {
      ...storyReadOptions,
      limit,
      offset,
      hasAudio,
      scenarioCardId,
      seriesId,
      language,
    });

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
 * GET /api/v1/me/stories/quiz-candidate
 * Returns one random readable story where the current child/parent has not completed quiz rewards.
 */
router.get('/quiz-candidate', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!childSessionCanUseQuizzes(req)) {
      return res.status(403).json({
        status: 'error',
        code: 'CHILD_SESSION_QUIZ_DISABLED',
        message: 'Quizzes are disabled for this child profile',
      });
    }

    const candidate = await getStoryQuizCandidateForProgress({
      userId: req.user!.id,
      childProfileId: req.childProfileId ?? null,
      sessionMode: req.sessionMode,
    });

    return res.json({
      status: 'success',
      candidate,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Get story quiz candidate failed');
    return res.status(500).json({
      status: 'error',
      code: 'QUIZ_CANDIDATE_FAILED',
      message: 'Failed to get quiz candidate',
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
    const story = await findReadableStoryForRequest(req, id);

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
 * GET /api/v1/me/stories/:id/quiz
 * Cheap cache check for an already generated story quiz. Never starts LLM generation.
 */
router.get('/:id/quiz', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!childSessionCanUseQuizzes(req)) {
      return res.status(403).json({
        status: 'error',
        code: 'CHILD_SESSION_QUIZ_DISABLED',
        message: 'Quizzes are disabled for this child profile',
      });
    }

    const { id } = req.params;
    const story = await findReadableStoryForRequest(req, id);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        code: 'STORY_NOT_FOUND',
        message: 'Story not found',
      });
    }

    const quiz = await getStoryQuiz(story, {
      userId: req.user!.id,
      childProfileId: req.childProfileId ?? null,
      sessionMode: req.sessionMode,
    });
    return res.json({
      status: 'success',
      quiz,
    });
  } catch (error) {
    try {
      return sendStoryQuizError(res, error);
    } catch (unexpected) {
      logger.error(
        { err: unexpected, userId: req.user?.id, storyId: req.params.id },
        'Get story quiz failed'
      );
      return res.status(500).json({
        status: 'error',
        code: 'QUIZ_GET_FAILED',
        message: 'Failed to get story quiz',
      });
    }
  }
});

/**
 * POST /api/v1/me/stories/:id/quiz
 * Generates a story quiz after an explicit invitation CTA click.
 */
router.post('/:id/quiz', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!childSessionCanUseQuizzes(req)) {
      return res.status(403).json({
        status: 'error',
        code: 'CHILD_SESSION_QUIZ_DISABLED',
        message: 'Quizzes are disabled for this child profile',
      });
    }

    const { id } = req.params;
    const story = await findReadableStoryForRequest(req, id);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        code: 'STORY_NOT_FOUND',
        message: 'Story not found',
      });
    }

    const quiz = await generateStoryQuiz(
      story,
      {
        userId: req.user!.id,
        childProfileId: req.childProfileId ?? story.childProfileId ?? story.createdByChildProfileId ?? null,
        sessionMode: req.sessionMode,
      },
      { force: req.body?.force === true }
    );

    return res.json({
      status: 'success',
      quiz,
    });
  } catch (error) {
    try {
      return sendStoryQuizError(res, error);
    } catch (unexpected) {
      logger.error(
        { err: unexpected, userId: req.user?.id, storyId: req.params.id },
        'Generate story quiz failed'
      );
      return res.status(500).json({
        status: 'error',
        code: 'QUIZ_GENERATION_FAILED',
        message: 'Failed to generate story quiz',
      });
    }
  }
});

/**
 * PUT /api/v1/me/stories/:id/quiz/answers/:activityId
 * Saves one answer for the current parent or child profile. The server recomputes result.
 */
router.put('/:id/quiz/answers/:activityId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!childSessionCanUseQuizzes(req)) {
      return res.status(403).json({
        status: 'error',
        code: 'CHILD_SESSION_QUIZ_DISABLED',
        message: 'Quizzes are disabled for this child profile',
      });
    }

    const { id, activityId } = req.params;
    const story = await findReadableStoryForRequest(req, id);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        code: 'STORY_NOT_FOUND',
        message: 'Story not found',
      });
    }

    const progress = await saveStoryQuizAnswer(story, {
      userId: req.user!.id,
      childProfileId: req.childProfileId ?? null,
      sessionMode: req.sessionMode,
    }, {
      activityId,
      selectedIds: req.body?.selectedIds,
      matchedPairs: req.body?.matchedPairs,
    });

    return res.json({
      status: 'success',
      progress,
    });
  } catch (error) {
    try {
      return sendStoryQuizError(res, error);
    } catch (unexpected) {
      logger.error(
        { err: unexpected, userId: req.user?.id, storyId: req.params.id },
        'Save story quiz answer failed'
      );
      return res.status(500).json({
        status: 'error',
        code: 'QUIZ_ANSWER_SAVE_FAILED',
        message: 'Failed to save story quiz answer',
      });
    }
  }
});

/**
 * GET /api/v1/me/stories/:id
 * Get a single story (manifest format for viewer). Requires auth + ownership.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const story = await findReadableStoryForRequest(req, id);

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
