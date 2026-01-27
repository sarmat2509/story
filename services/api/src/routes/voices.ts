import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getAudioDomainService } from '../services/aiService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/voices
 * Get available TTS voices (M5)
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { language } = req.query;
    
    // Validate language
    if (language && typeof language !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid language parameter'
      });
    }
    
    const audioDomain = getAudioDomainService();
    const voices = await audioDomain.getAvailableVoices(language || 'uk');
    
    logger.info({ 
      userId: req.user!.id, 
      language,
      voiceCount: voices.length 
    }, 'Voices fetched');
    
    res.json({
      status: 'success',
      data: {
        voices: voices.map(v => ({
          id: v.id,
          name: v.name,
          language: v.language,
          gender: v.gender,
          ageCategory: v.ageCategory,
          description: v.description,
          sampleUrl: v.sampleUrl,
          tags: v.tags,
          isPremium: v.isPremium,
        }))
      }
    });
  } catch (error) {
    logger.error({ 
      err: error, 
      userId: req.user?.id 
    }, 'Get voices failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to get voices'
    });
  }
});

export default router;
