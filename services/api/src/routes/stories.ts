import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { CreateStoryRequestSchema } from '@kazka/shared';
import { 
  createStoryRequest, 
  getStoryRequestStatus,
  getStory,
  listUserStories,
  deleteStory
} from '../services/storyOrchestrationService';
import { storyJobQueue } from '../jobs/storyJobProcessor';
import { logger } from '../utils/logger';

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
    
    res.json({
      status: 'success',
      story
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
      offset = '0' 
    } = req.query;
    
    const stories = await listUserStories(req.user!.id, {
      childProfileId: child_profile_id as string,
      language: language as string,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10)
    });
    
    res.json({
      status: 'success',
      stories,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: stories.length // TODO: Add proper total count
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
    const { eq, and } = await import('drizzle-orm');
    
    const [audioAsset] = await db
      .select({
        audioAsset: audioAssets,
        asset: assets,
      })
      .from(audioAssets)
      .innerJoin(assets, eq(audioAssets.assetId, assets.id))
      .where(and(
        eq(audioAssets.storyId, storyId),
        eq(audioAssets.status, 'completed')
      ))
      .limit(1);
    
    if (!audioAsset) {
      return res.status(404).json({
        status: 'error',
        message: 'Audio not generated yet'
      });
    }
    
    const audioMetadata = story.audioMetadata as any;
    
    res.json({
      status: 'success',
      data: {
        audioUrl: audioAsset.asset.signedUrl || audioAsset.asset.storageUrl,
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
