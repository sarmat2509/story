import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';
import { db } from '../db';
import { ttsVoices } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserSubscription, hasFeature, getPlanById } from '../services/planService';

const router = Router();

/**
 * GET /api/v1/voices
 * Get available TTS voices from database catalog
 * Returns all voices with premium/locked status based on user's plan
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { language = 'uk' } = req.query;
    const userId = req.user!.id;
    
    // Validate language
    if (typeof language !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid language parameter'
      });
    }
    
    // Check if user has premium voices feature enabled
    const hasPremiumVoices = await hasFeature(userId, 'premium_voices');
    
    // Get user's subscription plan for metadata
    const subscription = await getUserSubscription(userId);
    let userPlan = 'free';
    if (subscription) {
      const plan = await getPlanById(subscription.planId);
      userPlan = plan?.slug || 'free';
    }
    
    // Fetch all voices from database (including premium)
    const voices = await db
      .select({
        id: ttsVoices.providerVoiceId,
        name: ttsVoices.name,
        displayName: ttsVoices.displayName,
        gender: ttsVoices.gender,
        description: ttsVoices.description,
        previewUrl: ttsVoices.providerPreviewUrl,
        sampleAudioUrl: ttsVoices.sampleAudioUrl,
        isPremium: ttsVoices.isPremium,
        provider: ttsVoices.provider,
      })
      .from(ttsVoices)
      .where(and(
        eq(ttsVoices.language, language),
        eq(ttsVoices.isActive, true)
      ))
      .orderBy(ttsVoices.isPremium, ttsVoices.name); // Free voices first, then premium
    
    // Mark which voices are locked for this user
    const voicesWithAccess = voices.map(voice => ({
      ...voice,
      isLocked: voice.isPremium && !hasPremiumVoices,
    }));
    
    logger.info({ 
      userId, 
      language,
      userPlan,
      voiceCount: voices.length,
      premiumCount: voices.filter(v => v.isPremium).length,
      accessibleCount: voicesWithAccess.filter(v => !v.isLocked).length,
    }, 'Voices fetched from database');
    
    res.json({
      status: 'success',
      data: voicesWithAccess,
      meta: {
        userPlan,
        hasPremiumAccess: hasPremiumVoices,
      },
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
