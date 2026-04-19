import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { THEME_PALETTE_IDS } from '@wondertales/shared';
import { requireAuth } from '../middleware/authMiddleware';
import { getUserWithOAuth, updateUser, deleteUser, countUserOAuthIdentities } from '../services/userService';
import { getUserSessions, deleteSession } from '../services/sessionService';
import { unlinkOAuthProvider } from '../services/oauthService';
import { logger } from '../utils/logger';

const router = Router();

// Validation schema for user update
const updateUserSchema = z.object({
  displayName: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  preferredLocale: z.string().optional(),
  mode: z.enum(['instant', 'artisan']).optional(),
  pseudonym: z.string().max(100).nullable().optional(),
  aboutMe: z.string().max(1000).nullable().optional(),
  themePalette: z.enum(THEME_PALETTE_IDS).optional(),
});

// Get current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userWithOAuth = await getUserWithOAuth(req.user!.id);
    
    res.json({
      status: 'success',
      user: userWithOAuth,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Get user failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user',
    });
  }
});

// Update current user
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = updateUserSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
      return;
    }
    
    const { displayName, avatarUrl, preferredLocale, mode, pseudonym, aboutMe, themePalette } = validationResult.data;

    const updatedUser = await updateUser(req.user!.id, {
      displayName,
      avatarUrl,
      preferredLocale,
      mode,
      pseudonym,
      aboutMe,
      themePalette,
    });

    logger.info({ userId: req.user!.id, updates: { displayName, avatarUrl, preferredLocale, mode, pseudonym, aboutMe, themePalette } }, 'User profile updated');
    
    res.json({
      status: 'success',
      user: updatedUser,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Update user failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user',
    });
  }
});

// Delete account
router.delete('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await deleteUser(req.user!.id);
    
    logger.info({ userId: req.user!.id }, 'User account deleted');
    
    res.json({
      status: 'success',
      message: 'Account deleted successfully',
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Delete user failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete account',
    });
  }
});

// Get subscription usage (stories + audio remaining, resetsAt)
router.get('/subscription-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const { getPlanFeatures, getUserSubscription } = await import('../services/planService');
    const { getUsageForPeriod } = await import('../services/usageEventsService');
    const features = await getPlanFeatures(req.user!.id);
    const subscription = await getUserSubscription(req.user!.id);

    if (!subscription) {
      return res.status(403).json({
        status: 'error',
        message: 'No active subscription found',
        code: 'NO_SUBSCRIPTION',
      });
    }

    const currentPeriodStart = subscription.currentPeriodStart;
    const currentPeriodEnd = subscription.currentPeriodEnd ?? subscription.resetAt ?? new Date();

    const [storiesUsed, audioUsed] = await Promise.all([
      getUsageForPeriod(req.user!.id, currentPeriodStart, currentPeriodEnd, 'story_created'),
      getUsageForPeriod(req.user!.id, currentPeriodStart, currentPeriodEnd, 'audio_synthesized'),
    ]);
    const storiesLimit = features.storiesPerMonth;
    const audioLimit = features.audioStoriesPerMonth;

    const { default: config } = await import('../config');

    res.json({
      status: 'success',
      data: {
        stories: {
          used: storiesUsed,
          limit: storiesLimit,
          remaining: Math.max(0, storiesLimit - storiesUsed),
        },
        audio: {
          used: audioUsed,
          limit: audioLimit,
          remaining: Math.max(0, audioLimit - audioUsed),
        },
        resetsAt: subscription.resetAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        paymentProvider: subscription.paymentProvider,
        enableRealPayments: config.features.enableRealPayments,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Get subscription usage failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch subscription usage',
    });
  }
});

// Get active sessions
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await getUserSessions(req.user!.id);
    
    // Mark current session
    const sessionsWithCurrent = sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      isCurrent: session.token === req.sessionId,
    }));
    
    res.json({
      status: 'success',
      sessions: sessionsWithCurrent,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Get sessions failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch sessions',
    });
  }
});

// Revoke specific session
router.delete('/sessions/:sessionToken', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;
    
    await deleteSession(sessionToken);
    
    logger.info({ userId: req.user!.id, revokedSessionToken: sessionToken }, 'Session revoked');
    
    res.json({
      status: 'success',
      message: 'Session revoked successfully',
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Revoke session failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to revoke session',
    });
  }
});

// List user's story series (requires series_enabled feature)
router.get('/series', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { hasFeature } = await import('../services/planService');
    const hasSeriesAccess = await hasFeature(userId, 'series_enabled');

    if (!hasSeriesAccess) {
      return res.status(403).json({
        status: 'error',
        message: 'Story series feature not available in your plan',
        code: 'SERIES_ACCESS_REQUIRED',
      });
    }

    const { listUserSeries } = await import('../services/seriesService');
    const series = await listUserSeries(userId);

    res.json({
      status: 'success',
      series,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List series failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list series',
    });
  }
});

// Get linked OAuth providers
router.get('/oauth-providers', requireAuth, async (req: Request, res: Response) => {
  try {
    const userWithOAuth = await getUserWithOAuth(req.user!.id);
    
    res.json({
      status: 'success',
      providers: userWithOAuth?.oauthProviders || [],
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Get OAuth providers failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch OAuth providers',
    });
  }
});

// Link additional OAuth provider
router.post('/oauth-providers', requireAuth, async (req: Request, res: Response) => {
  try {
    // TODO: Implement OAuth linking flow
    res.status(501).json({
      status: 'error',
      message: 'OAuth linking not implemented yet',
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Link OAuth provider failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to link OAuth provider',
    });
  }
});

// Unlink OAuth provider
router.delete('/oauth-providers/:provider', requireAuth, async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    
    if (provider !== 'google' && provider !== 'apple') {
      res.status(400).json({
        status: 'error',
        message: 'Invalid provider',
      });
      return;
    }
    
    // Check if user has multiple OAuth providers
    const identityCount = await countUserOAuthIdentities(req.user!.id);
    
    if (identityCount <= 1) {
      res.status(400).json({
        status: 'error',
        message: 'Cannot unlink the only authentication method',
      });
      return;
    }
    
    await unlinkOAuthProvider(req.user!.id, provider);
    
    logger.info({ userId: req.user!.id, provider }, 'OAuth provider unlinked');
    
    res.json({
      status: 'success',
      message: `${provider} unlinked successfully`,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Unlink OAuth provider failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to unlink OAuth provider',
    });
  }
});

export default router;
