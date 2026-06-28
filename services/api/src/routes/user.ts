import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { THEME_PALETTE_IDS, UpdateChildModeExitPasscodeSchema } from '@wondertales/shared';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import { getUserWithOAuth, updateUser, deleteUser, countUserOAuthIdentities } from '../services/userService';
import { getUserSessions, deleteSession } from '../services/sessionService';
import {
  ChildModePasscodeError,
  updateChildModeExitPasscode,
} from '../services/childModeControlsService';
import { unlinkOAuthProvider } from '../services/oauthService';
import {
  DATA_PRIVACY_REQUEST_TYPES,
  createDataPrivacyRequest,
  listUserDataPrivacyRequests,
} from '../services/dataPrivacyRequestService';
import { toChildSafeSubscriptionUsageView, type SubscriptionUsageView } from '../services/subscriptionUsageView';
import { logger } from '../utils/logger';
import { toUserResponse } from '../utils/userResponse';

const router = Router();

// Validation schema for user update
const updateUserSchema = z.object({
  displayName: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  preferredLocale: z.string().optional(),
  mode: z.enum(['instant', 'artisan']).optional(),
  onboardingCompleted: z.boolean().optional(),
  pseudonym: z.string().max(100).nullable().optional(),
  aboutMe: z.string().max(1000).nullable().optional(),
  themePalette: z.enum(THEME_PALETTE_IDS).optional(),
});

const DataPrivacyRequestBodySchema = z
  .object({
    requestType: z.enum(DATA_PRIVACY_REQUEST_TYPES),
    message: z.string().max(2000).nullable().optional(),
  })
  .strict();

// Get current user
router.get('/', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    const userWithOAuth = await getUserWithOAuth(req.user!.id);
    
    res.json({
      status: 'success',
      user: userWithOAuth ? toUserResponse(userWithOAuth) : null,
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
router.patch('/', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
    
    const { displayName, avatarUrl, preferredLocale, mode, onboardingCompleted, pseudonym, aboutMe, themePalette } = validationResult.data;

    const updatedUser = await updateUser(req.user!.id, {
      displayName,
      avatarUrl,
      preferredLocale,
      mode,
      onboardingCompleted,
      pseudonym,
      aboutMe,
      themePalette,
    });

    logger.info({ userId: req.user!.id, updates: { displayName, avatarUrl, preferredLocale, mode, onboardingCompleted, pseudonym, aboutMe, themePalette } }, 'User profile updated');
    
    res.json({
      status: 'success',
      user: toUserResponse(updatedUser),
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Update user failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user',
    });
  }
});

// Set or rotate the account-level Child Mode exit passcode
router.patch('/child-mode-exit-passcode', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    const validationResult = UpdateChildModeExitPasscodeSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: validationResult.error.errors,
      });
      return;
    }

    const result = await updateChildModeExitPasscode(req.user!.id, validationResult.data);

    res.json({
      status: 'success',
      user: toUserResponse(result.user),
      childModeExitPasscode: result.childModeExitPasscode,
    });
  } catch (error) {
    if (error instanceof ChildModePasscodeError) {
      return res.status(error.statusCode).json({
        status: 'error',
        code: error.code,
        message: error.message,
      });
    }

    logger.error({ err: error, userId: req.user?.id }, 'Update Child Mode exit passcode failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to update Child Mode exit passcode',
    });
  }
});

// Delete account
router.delete('/', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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

// List current user's data privacy requests
router.get('/privacy-requests', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    const requests = await listUserDataPrivacyRequests(req.user!.id);

    res.json({
      status: 'success',
      data: requests,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'List data privacy requests failed');
    res.status(500).json({
      status: 'error',
      message: 'Failed to list privacy requests',
    });
  }
});

// Create export/deletion support request
router.post('/privacy-requests', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    const parsed = DataPrivacyRequestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request data',
        details: parsed.error.flatten(),
      });
    }

    const request = await createDataPrivacyRequest({
      userId: req.user!.id,
      requesterEmail: req.user!.email,
      requestType: parsed.data.requestType,
      message: parsed.data.message,
    });

    logger.info({
      userId: req.user!.id,
      requestId: request.id,
      requestType: request.requestType,
    }, 'Data privacy request created');

    return res.status(201).json({
      status: 'success',
      data: request,
    });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Create data privacy request failed');
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create privacy request',
    });
  }
});

// Get subscription usage (stories + audio remaining, resetsAt)
router.get('/subscription-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const { getPlanFeatures, getUserSubscription } = await import('../services/planService');
    const { getUsageForPeriod } = await import('../services/usageEventsService');
    const { getBundleBonusForPeriod } = await import('../services/bundleService');
    const { getGraphicNovelUsageForPeriod } = await import('../services/graphicNovelQuotaService');
    const usageOwnerId = req.parentUserId || req.user!.id;
    const childSafe = req.sessionMode === 'child';
    const features = await getPlanFeatures(usageOwnerId);
    const subscription = await getUserSubscription(usageOwnerId);

    if (!subscription) {
      return res.status(403).json({
        status: 'error',
        message: 'No active subscription found',
        code: 'NO_SUBSCRIPTION',
      });
    }

    const currentPeriodStart = subscription.currentPeriodStart;
    const currentPeriodEnd = subscription.currentPeriodEnd ?? subscription.resetAt ?? new Date();

    const bundleBonus = await getBundleBonusForPeriod(
      usageOwnerId,
      currentPeriodStart,
      currentPeriodEnd
    );

    const [storiesUsed, graphicNovelsUsed, audioUsed] = await Promise.all([
      getUsageForPeriod(usageOwnerId, currentPeriodStart, currentPeriodEnd, 'story_created'),
      getGraphicNovelUsageForPeriod({
        userId: usageOwnerId,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
      }),
      getUsageForPeriod(usageOwnerId, currentPeriodStart, currentPeriodEnd, 'audio_synthesized'),
    ]);
    const storiesPlanLimit = features.storiesPerMonth;
    const graphicNovelsPlanLimit = features.graphicNovelsPerMonth;
    const audioPlanLimit = features.audioStoriesPerMonth;
    const storiesLimit = storiesPlanLimit + bundleBonus.extraStories;
    const graphicNovelsLimit = graphicNovelsPlanLimit;
    const audioLimit = audioPlanLimit + bundleBonus.extraAudio;

    const { default: config } = await import('../config');

    const data: SubscriptionUsageView = {
      stories: {
        used: storiesUsed,
        limit: storiesLimit,
        remaining: Math.max(0, storiesLimit - storiesUsed),
        plan_limit: storiesPlanLimit,
        bundle_bonus: bundleBonus.extraStories,
      },
      graphicNovels: {
        used: graphicNovelsUsed,
        limit: graphicNovelsLimit,
        remaining: graphicNovelsLimit < 0 ? -1 : Math.max(0, graphicNovelsLimit - graphicNovelsUsed),
        plan_limit: graphicNovelsPlanLimit,
      },
      audio: {
        used: audioUsed,
        limit: audioLimit,
        remaining: Math.max(0, audioLimit - audioUsed),
        plan_limit: audioPlanLimit,
        bundle_bonus: bundleBonus.extraAudio,
      },
      resetsAt: subscription.resetAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      paymentProvider: subscription.paymentProvider,
      enableRealPayments: config.features.enableRealPayments,
    };

    res.json({
      status: 'success',
      data: childSafe ? toChildSafeSubscriptionUsageView(data) : data,
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
router.get('/sessions', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
router.delete('/sessions/:sessionToken', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
router.get('/series', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  try {
    const userId = req.parentUserId || req.user!.id;
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
router.get('/oauth-providers', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
router.post('/oauth-providers', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
router.delete('/oauth-providers/:provider', requireAuth, requireParentSession, async (req: Request, res: Response) => {
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
