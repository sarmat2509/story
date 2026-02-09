import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { CreateStoryRequestSchema } from '@kazka/shared';
import { 
  createStoryRequest, 
  getStoryRequestStatus,
  getStory,
  listUserStories,
  getTotalUserStoriesCount,
  deleteStory
} from '../services/storyOrchestrationService';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import { logger } from '../utils/logger';
import { stripAudioTags } from '../utils/audioTags';

const router = Router();

/**
 * POST /api/v1/stories
 * Create a new story request
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = CreateStoryRequestSchema.parse(req.body);
    
    // Create story request
    const requestId = await createStoryRequest(req.user!.id, validatedData);
    
    // Add job to queue for async processing
    const jobId = storyJobQueue.addJob(requestId);
    
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
 * GET /api/v1/stories/audio-usage
 * Get current audio usage stats
 */
router.get('/audio-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const { getPlanFeatures, getUserSubscription } = await import('../services/planService');
    const features = await getPlanFeatures(req.user!.id);
    const subscription = await getUserSubscription(req.user!.id);
    
    if (!subscription) {
      return res.status(403).json({
        status: 'error',
        message: 'No active subscription found',
        code: 'NO_SUBSCRIPTION'
      });
    }
    
    // Count audio stories generated this billing period
    const { db } = await import('../db');
    const { stories } = await import('../db/schema');
    const { eq, and, isNotNull, gte, sql } = await import('drizzle-orm');
    
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
    
    const used = Number(audioStoriesThisPeriod[0]?.count) || 0;
    const limit = features.audioStoriesPerMonth;
    const remaining = Math.max(0, limit - used);
    
    logger.info({ 
      userId: req.user!.id,
      used,
      limit,
      remaining 
    }, 'Audio usage fetched');
    
    res.json({
      status: 'success',
      data: {
        used,
        limit,
        remaining,
        resetsAt: subscription.resetAt,
        isAvailable: limit > 0
      }
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Failed to get audio usage');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get audio usage'
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
    
    // Strip audio tags from text for UI display
    const storyForClient = {
      ...story,
      scenes: Array.isArray(story.scenes) ? story.scenes.map((scene: any) => ({
        ...scene,
        text: stripAudioTags(scene.text || ''),
        visualPrompt: stripAudioTags(scene.visualPrompt || ''),
      })) : story.scenes,
      fullText: stripAudioTags(story.fullText || ''),
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

/**
 * GET /api/v1/stories
 * List user's stories
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { 
      child_profile_id, 
      language, 
      limit = '20', 
      offset = '0',
      has_audio
    } = req.query;
    
    const stories = await listUserStories(req.user!.id, {
      childProfileId: child_profile_id as string,
      language: language as string,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hasAudio: has_audio === 'true'
    });
    
    // Debug logging for first story
    if (stories.length > 0) {
      const firstStory = stories[0];
      const firstSceneWithImage = Array.isArray(firstStory.scenes) 
        ? firstStory.scenes.find((scene: any) => scene.image?.url)
        : null;
      
      logger.debug({
        storyId: firstStory.id,
        title: firstStory.title,
        hasScenes: !!firstStory.scenes,
        scenesType: Array.isArray(firstStory.scenes) ? 'array' : typeof firstStory.scenes,
        scenesCount: Array.isArray(firstStory.scenes) ? firstStory.scenes.length : 0,
        firstScene: Array.isArray(firstStory.scenes) && firstStory.scenes.length > 0 
          ? {
              sceneId: firstStory.scenes[0].sceneId,
              hasImage: !!firstStory.scenes[0].image,
              imageUrl: firstStory.scenes[0].image?.url,
              hasText: !!firstStory.scenes[0].text,
            }
          : null,
        firstSceneWithImage: firstSceneWithImage ? {
          sceneId: firstSceneWithImage.sceneId,
          imageUrl: firstSceneWithImage.image?.url,
        } : null,
        scenesWithImages: Array.isArray(firstStory.scenes)
          ? firstStory.scenes.filter((s: any) => s.image?.url).map((s: any) => ({
              sceneId: s.sceneId,
              hasUrl: !!s.image?.url,
            }))
          : [],
      }, 'List stories - first story debug');
    }
    
    // Get total count for pagination
    const totalCount = await getTotalUserStoriesCount(req.user!.id, {
      childProfileId: child_profile_id as string,
      language: language as string,
      hasAudio: has_audio === 'true'
    });
    
    // Strip audio tags from all stories for UI display
    const storiesForClient = stories.map(story => ({
      ...story,
      scenes: Array.isArray(story.scenes) ? story.scenes.map((scene: any) => ({
        ...scene,
        text: stripAudioTags(scene.text || ''),
        visualPrompt: stripAudioTags(scene.visualPrompt || ''),
      })) : story.scenes,
      fullText: stripAudioTags(story.fullText || ''),
    }));
    
    res.json({
      status: 'success',
      stories: storiesForClient,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: totalCount
      }
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
      tone: story.tone,
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
    const jobId = storyJobQueue.addJob(requestId);
    
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
    const { voiceId, speed, nightMode } = req.body;
    
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
    
    // Add job to queue
    const jobId = storyJobQueue.addJob({
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
    
    // Check if there's an active audio generation job
    const jobStatus = storyJobQueue.getAudioJobStatus(storyId);
    
    res.json({ 
      status: 'success', 
      audioMetadata: story.audioMetadata,
      jobStatus // 'queued' | 'processing' | null
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
    
    // 3. Check if alignment already exists
    const audioMetadata = story.audioMetadata as any;
    if (audioMetadata?.alignment) {
      return res.status(200).json({
        status: 'success',
        message: 'Alignment already exists',
        alignment: audioMetadata.alignment
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
    
    // 6. Update story metadata
    const { stories } = await import('../db/schema');
    await db.update(stories)
      .set({
        audioMetadata: {
          ...audioMetadata,
          alignment: {
            characters: alignmentResult.characters,
            words: alignmentResult.words,
            averageConfidence: alignmentResult.averageConfidence,
            provider: alignmentProvider.getProviderName().toLowerCase(),
            language: alignmentResult.language,
            generatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));
    
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
 * POST /api/v1/stories/:id/scenes/:sceneId/regenerate
 * Regenerate image for a specific scene (M4)
 */
router.post('/:id/scenes/:sceneId/regenerate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, sceneId } = req.params;
    const { visualPrompt } = req.body;
    
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
    
    // Add job to queue for regeneration
    const jobId = storyJobQueue.addJob({
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
    
    // Generate fresh signed URL
    const { getAssetStorageService } = await import('../services/assetStorageService');
    const assetStorage = getAssetStorageService();
    const { signedUrl } = await assetStorage.generateSignedUrl(audioAsset.asset.storagePath, 24);
    
    const audioMetadata = story.audioMetadata as any;
    
    res.json({
      status: 'success',
      data: {
        audioUrl: signedUrl,
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
