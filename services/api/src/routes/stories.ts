import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware';
import { CreateStoryRequestSchema } from '@wondertales/shared';
import { 
  createStoryRequest, 
  getStoryRequestStatus,
  retryStoryImages,
  getStory,
  listUserStories,
  listUserStorySummaries,
  getTotalUserStoriesCount,
  deleteStory,
  enforceUserJobLimit,
  getStoryGenerationStatus,
  enrichAllStoriesWithImages,
} from '../services/storyOrchestrationService';
import { publishStory, unpublishStory } from '../services/publishStoryService';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import { logger } from '../utils/logger';
import { stripAudioTags, stripCharacterIds } from '../utils/audioTags';
import { getFaceDeduplicationService } from '../services/faceDeduplicationService';
import { createCharacter } from '../services/characterService';
import { config } from '../config';
import { startTask, completeTask, STORY_TASKS } from '../services/storyProgress';
import { getStoryRepository } from '../repositories';

/**
 * Parse stored visualPrompt: if it contains JSON sceneVisual, return structured object;
 * otherwise return cleaned string.
 */
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
  return { visualPrompt: stripAudioTags(vp) };
}

const router = Router();

// ── Input Validation Schemas ──

const AudioGenerationSchema = z.object({
  voiceId: z.string().uuid().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  nightMode: z.boolean().optional(),
});

const GenerateFromPhotosSchema = z.object({
  photos: z.array(z.string().url()).min(1).max(5),
  ageGroup: z.enum(['2-3', '4-5', '6-7', '8-9', '10-12']),
  scenario: z.string(),
  language: z.enum(['uk', 'en', 'ru', 'es']),
  goals: z.array(z.string()).optional(),
  imageStyle: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

const RegenerateSceneSchema = z.object({
  visualPrompt: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/stories
 * Create a new story request
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = CreateStoryRequestSchema.parse(req.body);
    
    // Enforce per-user concurrent job limit
    try {
      await enforceUserJobLimit(req.user!.id);
    } catch (limitError) {
      return res.status(429).json({
        status: 'error',
        message: (limitError as Error).message,
      });
    }
    
    // Create story request
    const requestId = await createStoryRequest(req.user!.id, validatedData);
    
    // Add job to queue for async processing
    const jobId = await storyJobQueue.addJob(requestId);
    
    logger.info({ 
      userId: req.user!.id, 
      requestId, 
      jobId,
      language: validatedData.storyLanguage 
    }, 'Story request created');
    
    res.status(201).json({
      status: 'success',
      request: {
        id: requestId,
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Create story request failed');
    
    if (error instanceof Error && 'issues' in error) {
      // Zod validation error
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: (error as any).issues
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to create story request'
    });
  }
});

/**
 * Select appropriate default image style based on age group (for instant mode)
 * Styles defined in prompts/image/styles.ts with full textGuidance
 */
function selectDefaultImageStyle(ageGroup: string): string {
  const ageMap: Record<string, string> = {
    '2-3': 'soft_watercolor', // Soft, gentle, wet washes
    '4-5': 'felt_craft',      // Tactile, friendly, handmade
    '6-7': 'warm_3d',         // Modern, appealing, cinematic
    '8-9': 'warm_3d',         // Detailed 3D, polished
    '10-12': 'comic_line',    // Dynamic, engaging, graphic
  };
  
  return ageMap[ageGroup] || 'warm_3d'; // Default to 3D
}

/**
 * POST /api/v1/stories/instant
 * Create a story from uploaded photos (Instant Mode)
 * Auto-creates hidden characters from photos and generates story
 */
router.post('/instant', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = GenerateFromPhotosSchema.parse(req.body);
    
    // Enforce per-user concurrent job limit
    try {
      await enforceUserJobLimit(req.user!.id);
    } catch (limitError) {
      return res.status(429).json({
        status: 'error',
        message: (limitError as Error).message,
      });
    }
    
    logger.info({ 
      userId: req.user!.id, 
      photoCount: validatedData.photos.length,
      ageGroup: validatedData.ageGroup 
    }, 'Starting photo-based story generation (async mode)');
    
    // Create story request with photos stored in intermediate_data
    const storyRequestData = {
      uiLocale: validatedData.language,
      storyLanguage: validatedData.language,
      ageGroup: validatedData.ageGroup,
      scenarioCardId: validatedData.scenario === 'free' ? undefined : validatedData.scenario,
      goal: validatedData.goals?.[0],
      imageStyle: validatedData.imageStyle || selectDefaultImageStyle(validatedData.ageGroup),
      userNotes: validatedData.notes,
      selectedCharacters: [], // Will be populated by async job
      selectedChildren: [],
      childProfileId: undefined,
    };
    
    const requestId = await createStoryRequest(req.user!.id, storyRequestData);
    
    // Store photos, ageGroup and instant mode flag in intermediate_data
    await getStoryRepository().updateRequest(requestId, {
      intermediateData: {
        instantMode: true,
        photos: validatedData.photos,
        ageGroup: validatedData.ageGroup,
        characterSetupComplete: false,
      }
    });
    
    logger.info({ 
      userId: req.user!.id, 
      requestId,
      imageStyle: storyRequestData.imageStyle
    }, 'Story request created for instant mode (async)');
    
    // Add job to queue (will be routed to instantQueue)
    const jobId = await storyJobQueue.addJob(requestId);
    
    logger.info({ 
      userId: req.user!.id, 
      requestId, 
      jobId,
      photoCount: validatedData.photos.length,
      language: validatedData.language 
    }, 'Instant story request queued for async processing');
    
    // Return immediately with requestId
    res.status(201).json({
      status: 'success',
      request: {
        id: requestId,
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Generate from photos failed');
    
    if (error instanceof Error && 'issues' in error) {
      // Zod validation error
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: (error as any).issues
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate story from photos'
    });
  }
});

/**
 * GET /api/v1/stories/requests/:id/status
 * Check story request status
 */
router.get('/requests/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const status = await getStoryRequestStatus(id, req.user!.id);
    
    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: 'Story request not found'
      });
    }
    
    res.json({
      status: 'success',
      request: status
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, requestId: req.params.id }, 'Get request status failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get request status'
    });
  }
});

/**
 * POST /api/v1/stories/requests/:id/retry-images
 * Retry image generation only (for requests that failed at image phase, e.g. IMAGE_OTHER)
 */
router.post('/requests/:id/retry-images', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = await retryStoryImages(id, req.user!.id);
    res.json({
      status: 'success',
      request: {
        id: status.id,
        status: status.status,
      },
    });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'Story request not found') {
      return res.status(404).json({
        status: 'error',
        message: err.message,
      });
    }
    if (err.message === 'Request is not in failed state' || err.message === 'Cannot retry images: story data missing') {
      return res.status(400).json({
        status: 'error',
        message: err.message,
      });
    }
    logger.error({ err: error, userId: req.user?.id, requestId: req.params.id }, 'Retry images failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retry image generation',
    });
  }
});

/**
 * GET /api/v1/stories/published
 * List published stories (public, no auth)
 */
router.get('/published', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

    const storyRepo = getStoryRepository();
    const [stories, total] = await Promise.all([
      storyRepo.listPublished({ limit, offset }),
      storyRepo.countPublished(),
    ]);

    // Enrich scenes with image URLs from assets table (same as listUserStories)
    const enrichedScenesMap = await enrichAllStoriesWithImages(
      stories.map(s => ({ id: s.id, scenes: (s.scenes as any[]) || [] }))
    );

    // Use relative URLs for images — frontend handles base (proxy on web, API_BASE_URL on native)
    const strip = (s: any) => ({
      ...s,
      scenes: Array.isArray(s.scenes) ? s.scenes.map((scene: any) => ({
        ...scene,
        text: stripCharacterIds(stripAudioTags(scene.text || '')),
        ...parseSceneVisual(scene),
      })) : s.scenes,
      fullText: stripCharacterIds(stripAudioTags(s.fullText || '')),
    });

    const items = stories.map((s) => {
      const enrichedScenes = enrichedScenesMap.get(s.id) || s.scenes || [];
      const story = strip({ ...s, scenes: enrichedScenes });
      const scenes = Array.isArray(story.scenes) ? story.scenes : [];
      return {
        id: story.id,
        title: story.title,
        language: story.language,
        ageGroup: story.ageGroup,
        authorDisplayName: story.authorDisplayName || 'Anonymous',
        publishedAt: story.publishedAt,
        publishedSlug: story.publishedSlug,
        scenes: scenes.map((sc: any) => {
          const imgPath = sc.imageUrl ?? sc.image?.url;
          const imageUrl = imgPath
            ? (String(imgPath).startsWith('http') ? imgPath : `/api/v1/assets/${String(imgPath).replace(/^\/api\/v1\/assets\//, '')}`)
            : null;
          return {
            sceneId: sc.sceneId,
            text: sc.text,
            imageUrl,
          };
        }),
        audioMetadata: story.audioMetadata,
      };
    });

    res.json({
      status: 'success',
      stories: items,
      pagination: { limit, offset, total },
    });
  } catch (error) {
    logger.error({ err: error }, 'List published stories failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list published stories',
    });
  }
});

/**
 * GET /api/v1/stories/published/:slug
 * Get a published story by slug (public, optional auth for isOwner)
 */
router.get('/published/:slug', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const storyRepo = getStoryRepository();
    const story = await storyRepo.findByPublishedSlug(slug);

    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found',
      });
    }

    const isOwner = !!req.user && req.user.id === story.userId;
    const webAppUrl = config.web?.webAppUrl || '';

    // Enrich scenes with image URLs from assets table (same as list published)
    const enrichedScenesMap = await enrichAllStoriesWithImages([
      { id: story.id, scenes: (story.scenes as any[]) || [] },
    ]);
    const scenesWithImages = enrichedScenesMap.get(story.id) || story.scenes || [];

    const scenes = Array.isArray(scenesWithImages) ? scenesWithImages : [];
    const enrichedScenes = scenes.map((scene: any) => {
      const imgPath = scene.image?.url ?? scene.imageUrl;
      const imageUrl = imgPath
        ? (String(imgPath).startsWith('http') ? imgPath : `/api/v1/assets/${String(imgPath).replace(/^\/api\/v1\/assets\//, '')}`)
        : null;
      return {
        ...scene,
        text: stripCharacterIds(stripAudioTags(scene.text || '')),
        ...parseSceneVisual(scene),
        imageUrl,
      };
    });

    let audioUrl: string | null = null;
    if (story.audioMetadata) {
      const { db } = await import('../db');
      const { audioAssets, assets } = await import('../db/schema');
      const { eq, and, desc, isNull } = await import('drizzle-orm');
      const [audioAsset] = await db
        .select({ audioAsset: audioAssets, asset: assets })
        .from(audioAssets)
        .innerJoin(assets, eq(audioAssets.assetId, assets.id))
        .where(and(
          eq(audioAssets.storyId, story.id),
          eq(audioAssets.status, 'completed'),
          eq(audioAssets.isFinal, true),
          isNull(audioAssets.sceneGroupIndex)
        ))
        .orderBy(desc(audioAssets.createdAt))
        .limit(1);
      if (audioAsset) {
        audioUrl = `/api/v1/assets/${audioAsset.asset.storagePath}`;
      }
    }

    res.json({
      status: 'success',
      story: {
        id: story.id,
        title: story.title,
        language: story.language,
        ageGroup: story.ageGroup,
        authorDisplayName: story.authorDisplayName || 'Anonymous',
        publishedAt: story.publishedAt,
        publishedSlug: story.publishedSlug,
        scenes: enrichedScenes,
        fullText: stripCharacterIds(stripAudioTags(story.fullText || '')),
        audioMetadata: story.audioMetadata,
        audioUrl,
        isOwner,
        shareUrl: `${webAppUrl.replace(/\/$/, '')}/stories/${slug}`,
      },
    });
  } catch (error) {
    logger.error({ err: error, slug: req.params.slug }, 'Get published story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get published story',
    });
  }
});

/**
 * GET /api/v1/stories/:id
 * Get a completed story
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const story = await getStory(id, req.user!.id);
    
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // Strip audio tags and character IDs from text for UI display
    const storyForClient = {
      ...story,
      scenes: Array.isArray(story.scenes) ? story.scenes.map((scene: any) => ({
        ...scene,
        text: stripCharacterIds(stripAudioTags(scene.text || '')),
        ...parseSceneVisual(scene),
      })) : story.scenes,
      fullText: stripCharacterIds(stripAudioTags(story.fullText || '')),
    };
    
    res.json({
      status: 'success',
      story: storyForClient
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Get story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get story'
    });
  }
});

// Body is already camelCase via caseTransformMiddleware
const PublishStorySchema = z.object({
  isPublished: z.boolean(),
  visibility: z.enum(['public', 'unlisted']).optional().default('public'),
  shareCardSceneId: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/v1/stories/:id
 * Publish or unpublish a story
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ status: 'error', message: 'Invalid story ID' });
    }
    const body = PublishStorySchema.parse(req.body);

    if (body.isPublished) {
      const result = await publishStory(id, req.user!.id, body.visibility, body.shareCardSceneId);
      if (!result) {
        return res.status(404).json({
          status: 'error',
          message: 'Story not found',
        });
      }
      return res.json({
        status: 'success',
        slug: result.slug,
        shareUrl: result.shareUrl,
        publishedStoriesCount: result.publishedStoriesCount,
      });
    } else {
      const ok = await unpublishStory(id, req.user!.id);
      if (!ok) {
        return res.status(404).json({
          status: 'error',
          message: 'Story not found',
        });
      }
      return res.json({
        status: 'success',
        message: 'Story unpublished',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.issues,
      });
    }
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Publish story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get story'
    });
  }
});

/**
 * GET /api/v1/stories
 * List user's stories
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // caseTransformMiddleware converts query params to camelCase (scenario_card_id → scenarioCardId, has_audio → hasAudio)
    const { 
      childProfileId, 
      language, 
      limit = '20', 
      offset = '0',
      hasAudio: hasAudioParam,
      view,
      scenarioCardId: scenarioCardIdParam,
    } = req.query;

    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);
    const hasAudio = hasAudioParam === 'true';
    const scenarioCardId = scenarioCardIdParam as string | undefined;

    // Get total count for pagination (shared by both views)
    const totalCount = await getTotalUserStoriesCount(req.user!.id, {
      childProfileId: childProfileId as string,
      language: language as string,
      hasAudio,
      scenarioCardId,
    });

    // Summary view: lightweight payload for library grid
    if (view === 'summary') {
      const summaries = await listUserStorySummaries(req.user!.id, {
        childProfileId: childProfileId as string,
        language: language as string,
        limit: parsedLimit,
        offset: parsedOffset,
        hasAudio,
        scenarioCardId,
      });

      return res.json({
        status: 'success',
        stories: summaries,
        pagination: { limit: parsedLimit, offset: parsedOffset, total: totalCount },
      });
    }

    // Full view: complete story objects (default)
    const stories = await listUserStories(req.user!.id, {
      childProfileId: childProfileId as string,
      language: language as string,
      limit: parsedLimit,
      offset: parsedOffset,
      hasAudio,
      scenarioCardId,
    });
    
    // Strip audio tags and character IDs from all stories for UI display
    const storiesForClient = stories.map(story => ({
      ...story,
      scenes: Array.isArray(story.scenes) ? story.scenes.map((scene: any) => ({
        ...scene,
        text: stripCharacterIds(stripAudioTags(scene.text || '')),
        ...parseSceneVisual(scene),
      })) : story.scenes,
      fullText: stripCharacterIds(stripAudioTags(story.fullText || '')),
    }));
    
    res.json({
      status: 'success',
      stories: storiesForClient,
      pagination: { limit: parsedLimit, offset: parsedOffset, total: totalCount },
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List stories failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list stories'
    });
  }
});

/**
 * DELETE /api/v1/stories/:id
 * Delete a story
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await deleteStory(id, req.user!.id);
    
    logger.info({ userId: req.user!.id, storyId: id }, 'Story deleted');
    
    res.json({
      status: 'success',
      message: 'Story deleted successfully'
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Delete story failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete story'
    });
  }
});

/**
 * POST /api/v1/stories/:id/continue
 * Generate a continuation for a story (M8)
 */
router.post('/:id/continue', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    const userId = req.user!.id;
    
    // Enforce per-user concurrent job limit
    try {
      await enforceUserJobLimit(userId);
    } catch (limitError) {
      return res.status(429).json({
        status: 'error',
        message: (limitError as Error).message,
      });
    }
    
    // Check if user has series feature enabled
    const { hasFeature } = await import('../services/planService');
    const hasSeriesAccess = await hasFeature(userId, 'series_enabled');
    
    if (!hasSeriesAccess) {
      return res.status(403).json({
        status: 'error',
        message: 'Story series feature not available in your plan',
        code: 'FEATURE_NOT_AVAILABLE'
      });
    }
    
    // Import series service
    const { getOrCreateSeries } = await import('../services/seriesService');
    const { db } = await import('../db');
    const { stories } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    
    // 1. Verify ownership
    const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
    if (!story || story.userId !== userId) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Story not found' 
      });
    }
    
    // 2. NO LIMIT CHECK - continuations are unlimited!
    // Users can create as many parts as they want
    
    // 3. Get or create series
    const { seriesId, partNumber, continuationContext } = await getOrCreateSeries(storyId);
    
    logger.info({ 
      userId, 
      storyId, 
      seriesId, 
      nextPartNumber: partNumber + 1 
    }, 'Creating story continuation');
    
    // 4. Create continuation request
    const { createContinuationRequest } = await import('../services/storyOrchestrationService');
    
    // Get original story request to preserve all settings
    const { storyRequests } = await import('../db/schema');
    const [originalRequest] = await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId));
    
    const requestId = await createContinuationRequest(userId, {
      language: story.language,
      ageGroup: story.ageGroup,
      childProfileId: story.childProfileId,
      imageStyle: (story.metadata as any)?.imageStyle || 'watercolor',
      moralTheme: story.moralTheme,
      // Preserve original request settings
      scenarioCardId: originalRequest?.scenarioCardId || null,
      selectedCharacters: originalRequest?.selectedCharacters || null,
      selectedChildren: originalRequest?.selectedChildren || null,
      userNotes: originalRequest?.userNotes || null,
      // Series context
      seriesId,
      partNumber: partNumber + 1,
      continuationContext,
    });
    
    // 5. Queue job
    const jobId = await storyJobQueue.addJob(requestId);
    
    logger.info({ 
      userId, 
      requestId, 
      jobId, 
      seriesId, 
      partNumber: partNumber + 1 
    }, 'Story continuation queued');
    
    res.status(202).json({
      status: 'success',
      request: {
        id: requestId,
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error({ 
      err: error, 
      userId: req.user?.id, 
      storyId: req.params.id 
    }, 'Create continuation failed');
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to create continuation'
    });
  }
});

/**
 * GET /api/v1/stories/:id/series
 * Get series information for a story
 */
router.get('/:id/series', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    const userId = req.user!.id;
    
    // Import series service
    const { getSeriesInfo } = await import('../services/seriesService');
    const { getStory } = await import('../services/storyOrchestrationService');
    
    // Verify ownership
    const story = await getStory(storyId, userId);
    if (!story) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Story not found' 
      });
    }
    
    // Get series info
    const seriesInfo = await getSeriesInfo(storyId);
    
    logger.info({
      storyId,
      userId,
      hasSeriesInfo: !!seriesInfo,
      seriesInfo: seriesInfo,
    }, 'Series info retrieved');
    
    if (!seriesInfo) {
      return res.json({
        status: 'success',
        data: null
      });
    }
    
    res.json({
      status: 'success',
      data: seriesInfo
    });
  } catch (error) {
    logger.error({ 
      err: error, 
      userId: req.user?.id, 
      storyId: req.params.id 
    }, 'Get series info failed');
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to get series information'
    });
  }
});

/**
 * POST /api/v1/stories/:id/audio
 * Generate audio for a story (M5)
 */
router.post('/:id/audio', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    
    // Validate input
    const parseResult = AudioGenerationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid audio parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }
    const { voiceId, speed, nightMode } = parseResult.data;
    
    logger.info({ 
      storyId, 
      userId: req.user!.id, 
      voiceId,
      speed,
      nightMode 
    }, 'Audio generation request received');
    
    // Load story to verify ownership
    const story = await getStory(storyId, req.user!.id);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // Check if audio already exists and is valid (not an error state)
    const audioMetadata = story.audioMetadata as any;
    if (audioMetadata && !audioMetadata.error) {
      logger.info({ storyId, userId: req.user!.id }, 'Audio already exists - skipping generation');
      return res.status(200).json({
        status: 'success',
        message: 'Audio already exists',
        audio: audioMetadata
      });
    }
    
    // If audio failed previously, log and allow regeneration
    if (audioMetadata?.error) {
      logger.info({ 
        storyId, 
        userId: req.user!.id,
        previousError: audioMetadata.errorMessage 
      }, 'Previous audio generation failed - allowing retry');
    }
    
    // Check plan limits
    const { getPlanFeatures, getUserSubscription } = await import('../services/planService');
    const features = await getPlanFeatures(req.user!.id);
    const subscription = await getUserSubscription(req.user!.id);
    
    if (features.audioStoriesPerMonth === 0) {
      return res.status(403).json({
        status: 'error',
        message: 'Audio generation not available in your plan',
        code: 'AUDIO_NOT_AVAILABLE'
      });
    }
    
    // Count audio stories generated this billing period
    const { db } = await import('../db');
    const { stories } = await import('../db/schema');
    const { eq, and, isNotNull, gte, sql } = await import('drizzle-orm');
    
    if (!subscription) {
      return res.status(403).json({
        status: 'error',
        message: 'No active subscription found',
        code: 'NO_SUBSCRIPTION'
      });
    }
    
    const currentPeriodStart = subscription.currentPeriodStart;
    const audioStoriesThisPeriod = await db
      .select({ count: sql<number>`count(*)` })
      .from(stories)
      .where(
        and(
          eq(stories.userId, req.user!.id),
          isNotNull(stories.audioMetadata),
          gte(stories.createdAt, currentPeriodStart)
        )
      );
    
    const storiesGenerated = Number(audioStoriesThisPeriod[0]?.count) || 0;
    
    if (storiesGenerated >= features.audioStoriesPerMonth) {
      return res.status(403).json({
        status: 'error',
        message: 'You have reached your monthly audio story limit',
        code: 'AUDIO_LIMIT_EXCEEDED',
        limit: features.audioStoriesPerMonth,
        used: storiesGenerated,
        resetsAt: subscription.resetAt
      });
    }
    
    // Enforce per-user concurrent job limit
    try {
      await enforceUserJobLimit(req.user!.id);
    } catch (limitError) {
      return res.status(429).json({
        status: 'error',
        message: (limitError as Error).message,
      });
    }
    
    // Add job to queue
    const jobId = await storyJobQueue.addJob({
      type: 'audio_generation',
      storyId,
      userId: req.user!.id,
      voiceParams: { voiceId, speed, nightMode }
    });
    
    logger.info({ 
      userId: req.user!.id, 
      storyId, 
      jobId,
      storiesUsed: storiesGenerated,
      storiesLimit: features.audioStoriesPerMonth
    }, 'Audio generation job created');
    
    res.status(202).json({
      status: 'success',
      message: 'Audio generation started',
      jobId
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Audio generation request failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to start audio generation'
    });
  }
});

/**
 * GET /api/v1/stories/:id/audio-status
 * Get lightweight audio status for polling (M5)
 */
router.get('/:id/audio-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    
    // Import here to avoid circular dependencies
    const { db } = await import('../db');
    const { stories } = await import('../db/schema');
    const { eq, and } = await import('drizzle-orm');
    
    const [story] = await db.select({
      audioMetadata: stories.audioMetadata
    })
      .from(stories)
      .where(and(
        eq(stories.id, storyId),
        eq(stories.userId, req.user!.id)
      ))
      .limit(1);
    
    if (!story) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Story not found' 
      });
    }
    
    // Check audio job status with concurrency-aware queue info
    const { audioQueue } = await import('../jobs/storyJobProcessor');
    const queueInfo = audioQueue.getQueueInfo(j => j.storyId === storyId);

    // When audio is ready (no job, metadata indicates success), include audioUrl and duration
    // so client can show player immediately without a separate GET /audio request
    let audioUrl: string | null = null;
    let duration: number | null = null;
    const meta = story.audioMetadata as Record<string, unknown> | null;
    if (!queueInfo.jobStatus && meta && meta.error !== true) {
      const { audioAssets, assets } = await import('../db/schema');
      const { eq, and, desc, isNull } = await import('drizzle-orm');
      const [audioAsset] = await db
        .select({ audioAsset: audioAssets, asset: assets })
        .from(audioAssets)
        .innerJoin(assets, eq(audioAssets.assetId, assets.id))
        .where(and(
          eq(audioAssets.storyId, storyId),
          eq(audioAssets.status, 'completed'),
          eq(audioAssets.isFinal, true),
          isNull(audioAssets.sceneGroupIndex)
        ))
        .orderBy(desc(audioAssets.createdAt))
        .limit(1);
      if (audioAsset) {
        audioUrl = `/api/v1/assets/${audioAsset.asset.storagePath}`;
        duration = audioAsset.audioAsset.durationSeconds
          ? parseFloat(audioAsset.audioAsset.durationSeconds.toString())
          : 0;
      }
    }

    res.json({
      status: 'success',
      audioMetadata: story.audioMetadata,
      audioUrl,
      duration,
      jobStatus: queueInfo.jobStatus,
      queuePosition: queueInfo.queuePosition,
      estimatedWaitMs: queueInfo.estimatedWaitMs,
      processingStartedAt: queueInfo.processingStartedAt,
      estimatedProcessingMs: queueInfo.estimatedProcessingMs,
      activeJobsCount: queueInfo.activeJobsCount,
      maxConcurrency: queueInfo.maxConcurrency,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Audio status check failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to check audio status'
    });
  }
});

/**
 * POST /api/v1/stories/:id/alignment
 * Generate forced alignment for existing audio (M6)
 */
router.post('/:id/alignment', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    
    logger.info({ 
      storyId, 
      userId: req.user!.id 
    }, 'Alignment generation request received');
    
    // 1. Load story to verify ownership
    const story = await getStory(storyId, req.user!.id);
    if (!story) {
      logger.warn({ storyId }, 'Story not found for alignment generation');
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // 2. Check if audio exists
    if (!story.audioMetadata) {
      logger.warn({ storyId }, 'No audio metadata found - cannot generate alignment');
      return res.status(400).json({
        status: 'error',
        message: 'Story has no audio. Generate audio first.',
        code: 'NO_AUDIO_METADATA'
      });
    }
    
    // 3. Check if alignment already exists (Phase 2: alignments table + fallback)
    const { getAlignmentRepository } = await import('../repositories');
    const existingAlignment = await getAlignmentRepository().findByStoryId(storyId);
    const audioMetadata = story.audioMetadata as any;
    const alignmentFromMetadata = audioMetadata?.alignment;
    if (existingAlignment ?? alignmentFromMetadata) {
      const alignment = existingAlignment?.data ?? alignmentFromMetadata;
      return res.status(200).json({
        status: 'success',
        message: 'Alignment already exists',
        alignment,
      });
    }
    
    // 4. Find final audio asset
    const { audioAssets, assets } = await import('../db/schema');
    const { eq, and } = await import('drizzle-orm');
    const { db } = await import('../db');
    
    const finalAudioAssets = await db
      .select({
        audioAsset: audioAssets,
        asset: assets,
      })
      .from(audioAssets)
      .innerJoin(assets, eq(audioAssets.assetId, assets.id))
      .where(
        and(
          eq(audioAssets.storyId, storyId),
          eq(audioAssets.isFinal, true)
        )
      )
      .limit(1);
    
    logger.info({ 
      storyId, 
      finalAudioAssetsCount: finalAudioAssets.length 
    }, 'Final audio assets found');
    
    if (finalAudioAssets.length === 0) {
      logger.warn({ storyId }, 'No final audio asset found');
      return res.status(404).json({
        status: 'error',
        message: 'Final audio asset not found',
        code: 'NO_FINAL_AUDIO'
      });
    }
    
    const audioAssetId = finalAudioAssets[0].audioAsset.id;
    const assetId = finalAudioAssets[0].audioAsset.assetId;

    // 5. Generate alignment
    const { getAlignmentProvider } = await import('../services/aiService');
    const { getAudioDomainService } = await import('../domain/audio/AudioDomainService');
    
    const alignmentProvider = getAlignmentProvider();
    const audioDomain = getAudioDomainService();
    
    logger.info({
      storyId,
      userId: req.user!.id,
      audioAssetId,
      alignmentProvider: alignmentProvider.getProviderName(),
    }, 'Generating alignment on-demand');
    
    const alignmentResult = await audioDomain.generateAlignmentForStory(
      storyId,
      audioAssetId,
      alignmentProvider
    );
    
    // 6. Store alignment in alignments table (Phase 2)
    const alignmentData = {
      characters: alignmentResult.characters,
      words: alignmentResult.words,
      averageConfidence: alignmentResult.averageConfidence,
      provider: alignmentProvider.getProviderName().toLowerCase(),
      language: alignmentResult.language,
      generatedAt: new Date().toISOString(),
    };
    await getAlignmentRepository().upsert(storyId, alignmentData, assetId);

    if (story.isPublished && story.publishedSlug) {
      const { getStoryRepository } = await import('../repositories');
      await getStoryRepository().incrementPublicRenderVersion(storyId);
    }

    logger.info({
      storyId,
      wordCount: alignmentResult.words.length,
      averageConfidence: alignmentResult.averageConfidence,
    }, 'Alignment generated successfully on-demand');
    
    res.status(201).json({
      status: 'success',
      message: 'Alignment generated successfully',
      alignment: {
        wordCount: alignmentResult.words.length,
        averageConfidence: alignmentResult.averageConfidence,
        provider: alignmentProvider.getProviderName().toLowerCase(),
      }
    });
    
  } catch (error) {
    logger.error({ 
      err: error, 
      storyId: req.params.id,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    }, 'Alignment generation failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate alignment',
      details: error instanceof Error ? error.message : String(error),
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/v1/stories/:id/status
 * Get story generation status with task-based progress (M4)
 */
router.get('/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const requestStatus = await getStoryRequestStatus(id, req.user!.id);
    
    if (!requestStatus) {
      return res.status(404).json({
        status: 'error',
        message: 'Story request not found'
      });
    }
    
    res.json({
      status: 'success',
      storyId: requestStatus.storyId,
      generationStatus: requestStatus.status,
      progress: requestStatus.progressData || {
        overallProgress: requestStatus.progress || 0,
        activeTasks: [],
        completedTasks: [],
      }
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Get story status failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get story status'
    });
  }
});

/**
 * GET /api/v1/stories/:id/manifest
 * Get story manifest with all scenes and assets (M4)
 */
router.get('/:id/manifest', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const story = await getStory(id, req.user!.id);
    
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // Get all scenes and assets
    const { getStoryManifest } = await import('../services/storyOrchestrationService');
    const manifest = await getStoryManifest(id);
    
    res.json({
      status: 'success',
      manifest
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Get story manifest failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get story manifest'
    });
  }
});

/**
 * GET /api/v1/stories/:id/generation-status
 * Get lightweight generation status for polling (no scenes, no assets)
 */
router.get('/:id/generation-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const status = await getStoryGenerationStatus(id, req.user!.id);
    
    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    res.json({
      status: 'success',
      generationStatus: status
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id, storyId: req.params.id }, 'Get generation status failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get generation status'
    });
  }
});

/**
 * POST /api/v1/stories/:id/scenes/:sceneId/regenerate
 * Regenerate image for a specific scene (M4)
 */
router.post('/:id/scenes/:sceneId/regenerate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, sceneId } = req.params;
    
    // Validate input
    const parseResult = RegenerateSceneSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid regeneration parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }
    const { visualPrompt } = parseResult.data;
    
    const story = await getStory(id, req.user!.id);
    
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // Check if scene exists
    const scene = (story.scenes as any[]).find(
      s => s.sceneId === parseInt(sceneId, 10)
    );
    
    if (!scene) {
      return res.status(404).json({
        status: 'error',
        message: 'Scene not found'
      });
    }
    
    // Enforce per-user concurrent job limit
    try {
      await enforceUserJobLimit(req.user!.id);
    } catch (limitError) {
      return res.status(429).json({
        status: 'error',
        message: (limitError as Error).message,
      });
    }
    
    // Add job to queue for regeneration
    const jobId = await storyJobQueue.addJob({
      type: 'regenerate_scene_image',
      storyId: id,
      sceneId: parseInt(sceneId, 10),
      visualPrompt: visualPrompt || scene.visualPrompt,
    });
    
    logger.info({ 
      userId: req.user!.id, 
      storyId: id, 
      sceneId,
      jobId 
    }, 'Scene image regeneration started');
    
    res.json({
      status: 'success',
      message: 'Regeneration started',
      jobId
    });
  } catch (error) {
    logger.error({ 
      err: error, 
      userId: req.user?.id, 
      storyId: req.params.id,
      sceneId: req.params.sceneId
    }, 'Regenerate scene image failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to start regeneration'
    });
  }
});

/**
 * POST /api/v1/stories/:id/tts
 * Generate audio for story (M5)
 */
router.post('/:id/tts', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    const { voiceId, speed, nightMode } = req.body;
    
    // Ownership check: verify the story belongs to the requesting user
    const story = await getStory(storyId, req.user!.id);
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // Validate inputs
    if (speed && (typeof speed !== 'number' || speed < 0.5 || speed > 2.0)) {
      return res.status(400).json({
        status: 'error',
        message: 'Speed must be between 0.5 and 2.0'
      });
    }
    
    // Import orchestration function
    const { generateStoryAudio } = await import('../services/storyOrchestrationService');
    
    // Start generation
    await generateStoryAudio(storyId, voiceId, {
      speed,
      nightMode: nightMode || false,
    });
    
    logger.info({ 
      userId: req.user!.id, 
      storyId,
      voiceId,
      speed,
      nightMode 
    }, 'Audio generation completed');
    
    res.json({
      status: 'success',
      message: 'Audio generated successfully'
    });
  } catch (error) {
    logger.error({ 
      err: error, 
      userId: req.user?.id, 
      storyId: req.params.id 
    }, 'Generate audio failed');
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to generate audio'
    });
  }
});

/**
 * GET /api/v1/stories/:id/audio
 * Get audio URL for story (M5)
 */
router.get('/:id/audio', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: storyId } = req.params;
    
    // Import orchestration function
    const { getStory } = await import('../services/storyOrchestrationService');
    
    // Get story
    const story = await getStory(storyId, req.user!.id);
    
    if (!story) {
      return res.status(404).json({
        status: 'error',
        message: 'Story not found'
      });
    }
    
    // Get audio asset
    const { db } = await import('../db');
    const { audioAssets, assets } = await import('../db/schema');
    const { eq, and, desc, isNull } = await import('drizzle-orm');
    
    const [audioAsset] = await db
      .select({
        audioAsset: audioAssets,
        asset: assets,
      })
      .from(audioAssets)
      .innerJoin(assets, eq(audioAssets.assetId, assets.id))
      .where(and(
        eq(audioAssets.storyId, storyId),
        eq(audioAssets.status, 'completed'),
        eq(audioAssets.isFinal, true), // ✅ Only final audio
        isNull(audioAssets.sceneGroupIndex) // ✅ NULL = final
      ))
      .orderBy(desc(audioAssets.createdAt))
      .limit(1);
    
    if (!audioAsset) {
      return res.status(404).json({
        status: 'error',
        message: 'Audio not ready yet. Please try again.',
        code: 'AUDIO_NOT_READY'
      });
    }
    
    const audioUrl = `/api/v1/assets/${audioAsset.asset.storagePath}`;
    
    const audioMetadata = story.audioMetadata as any;
    
    res.json({
      status: 'success',
      data: {
        audioUrl,
        duration: audioAsset.audioAsset.durationSeconds ? parseFloat(audioAsset.audioAsset.durationSeconds.toString()) : 0,
        voice: {
          id: audioAsset.audioAsset.voiceId,
          name: audioAsset.audioAsset.voiceName,
          language: audioAsset.audioAsset.language,
        },
        metadata: {
          generatedAt: audioMetadata?.generatedAt,
          nightMode: audioAsset.audioAsset.nightMode,
          cached: false, // TODO: track cache hits
        },
      }
    });
  } catch (error) {
    logger.error({ 
      err: error, 
      userId: req.user?.id, 
      storyId: req.params.id 
    }, 'Get audio failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get audio'
    });
  }
});

export default router;
