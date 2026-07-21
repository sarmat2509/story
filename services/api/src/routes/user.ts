import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { THEME_PALETTE_IDS, UpdateChildModeExitPasscodeSchema } from '@wondertales/shared';
import { requireAuth, requireParentSession } from '../middleware/authMiddleware';
import {
  getUserWithOAuth,
  updateUser,
  deleteUser,
  countUserOAuthIdentities,
} from '../services/userService';
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
import {
  toChildSafeSubscriptionUsageView,
  type SubscriptionUsageView,
} from '../services/subscriptionUsageView';
import { getStoryCharacterSelectionLimit } from '../domain/story/storyCharacterSelectionLimit';
import { logger } from '../utils/logger';
import { toUserResponse } from '../utils/userResponse';
import { childSessionCanReadFamilyStories } from '../services/childStoryAccessService';

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

const StoryMixAllocationSchema = z
  .object({
    graphicNovels: z.number().int().min(0).max(100),
    mixedStories: z.number().int().min(0).max(100),
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

    const {
      displayName,
      avatarUrl,
      preferredLocale,
      mode,
      onboardingCompleted,
      pseudonym,
      aboutMe,
      themePalette,
    } = validationResult.data;

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

    logger.info(
      {
        userId: req.user!.id,
        updates: {
          displayName,
          avatarUrl,
          preferredLocale,
          mode,
          onboardingCompleted,
          pseudonym,
          aboutMe,
          themePalette,
        },
      },
      'User profile updated'
    );

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
router.patch(
  '/child-mode-exit-passcode',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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
  }
);

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
router.get(
  '/privacy-requests',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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
  }
);

// Create export/deletion support request
router.post(
  '/privacy-requests',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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

      logger.info(
        {
          userId: req.user!.id,
          requestId: request.id,
          requestType: request.requestType,
        },
        'Data privacy request created'
      );

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
  }
);

// Get subscription usage (stories + audio remaining, resetsAt)
router.get('/subscription-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const { getPlanFeatures, getUserSubscription } = await import('../services/planService');
    const { getUsageForPeriod } = await import('../services/usageEventsService');
    const { getUsageEventsRepository } = await import('../repositories');
    const { calculateBundleGraphicNovelBonus, getBundleBonusForPeriod } =
      await import('../services/bundleService');
    const { getGraphicNovelUsageForPeriod } = await import('../services/graphicNovelQuotaService');
    const { getActivatedConditionalQuotaExtension } =
      await import('../services/conditionalQuotaExtensionService');
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

    const [storiesUsed, graphicNovelsUsed, audioUsed, storyMixUsage] = await Promise.all([
      getUsageForPeriod(usageOwnerId, currentPeriodStart, currentPeriodEnd, 'story_created'),
      getGraphicNovelUsageForPeriod({
        userId: usageOwnerId,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
      }),
      getUsageForPeriod(usageOwnerId, currentPeriodStart, currentPeriodEnd, 'audio_synthesized'),
      getUsageEventsRepository().getStoryMixUsageForPeriod(
        usageOwnerId,
        currentPeriodStart,
        currentPeriodEnd
      ),
    ]);
    const storiesPlanLimit = features.storiesPerMonth;
    const graphicNovelsPlanLimit = features.graphicNovelsPerMonth;
    const mixedStoriesPlanLimit = features.mixedStoriesPerMonth;
    const audioPlanLimit = features.audioStoriesPerMonth;
    const storyMixBudgetPoints = features.storyMixBudgetPoints;
    const graphicNovelsBundleBonus = calculateBundleGraphicNovelBonus({
      extraStories: bundleBonus.extraStories,
      storiesPlanLimit,
      graphicNovelsPlanLimit,
    });
    const storiesConditionalExtension = getActivatedConditionalQuotaExtension({
      metadata: subscription.metadata as Record<string, unknown> | null,
      featureSlug: 'stories_per_month',
      currentUsage: storiesUsed,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
    });
    const graphicNovelsConditionalExtension = getActivatedConditionalQuotaExtension({
      metadata: subscription.metadata as Record<string, unknown> | null,
      featureSlug: 'graphic_novels_per_month',
      currentUsage: graphicNovelsUsed,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
    });
    const storiesLimit =
      storiesPlanLimit + bundleBonus.extraStories + storiesConditionalExtension;
    const mixedStoriesLimit =
      mixedStoriesPlanLimit > 0 ? mixedStoriesPlanLimit + bundleBonus.extraStories : 0;
    const graphicNovelsLimit =
      graphicNovelsPlanLimit + graphicNovelsBundleBonus + graphicNovelsConditionalExtension;
    const audioLimit = audioPlanLimit + bundleBonus.extraAudio;
    const storyMixBudgetWithBundle =
      storyMixBudgetPoints > 0
        ? storyMixBudgetPoints + (bundleBonus.extraStories + storiesConditionalExtension) * 1_000
        : 0;
    const storyMixRemainingPoints = Math.max(0, storyMixBudgetWithBundle - storyMixUsage.points);
    const storedStoryMix = (subscription.metadata as Record<string, unknown> | null)?.storyMix;
    const storedAllocation =
      storedStoryMix && typeof storedStoryMix === 'object'
        ? (storedStoryMix as Record<string, unknown>)
        : null;
    const storedAllocationIsCurrentPeriod =
      storedAllocation?.periodStart === subscription.currentPeriodStart.toISOString();
    const requestedGraphicNovels = storedAllocationIsCurrentPeriod
      ? Math.max(0, Math.trunc(Number(storedAllocation?.graphicNovels) || 0))
      : 0;
    const requestedMixedStories = storedAllocationIsCurrentPeriod
      ? Math.max(0, Math.trunc(Number(storedAllocation?.mixedStories) || 0))
      : 0;
    const allocatedGraphicNovels = Math.max(
      storyMixUsage.graphicNovels,
      Math.min(
        Math.floor(storyMixBudgetWithBundle / 8_370),
        requestedGraphicNovels
      )
    );
    const allocatedMixedStories = Math.max(
      storyMixUsage.mixedStories,
      Math.min(
        Math.floor(
          Math.max(0, storyMixBudgetWithBundle - allocatedGraphicNovels * 8_370) / 5_030
        ),
        requestedMixedStories
      )
    );
    const allocatedStories = Math.max(
      storyMixUsage.stories,
      Math.floor(
        Math.max(
          0,
          storyMixBudgetWithBundle - allocatedGraphicNovels * 8_370 - allocatedMixedStories * 5_030
        ) / 1_000
      )
    );

    const { default: config } = await import('../config');

    const data: SubscriptionUsageView = {
      stories: {
        used: storyMixBudgetPoints > 0 ? storyMixUsage.stories : storiesUsed,
        limit:
          storyMixBudgetPoints > 0
            ? allocatedStories
            : storiesLimit,
        remaining:
          storyMixBudgetPoints > 0
            ? Math.max(0, allocatedStories - storyMixUsage.stories)
            : Math.max(0, storiesLimit - storiesUsed),
        plan_limit: storiesPlanLimit,
        bundle_bonus: bundleBonus.extraStories,
      },
      graphicNovels: {
        used: storyMixBudgetPoints > 0 ? storyMixUsage.graphicNovels : graphicNovelsUsed,
        limit: storyMixBudgetPoints > 0 ? allocatedGraphicNovels : graphicNovelsLimit,
        remaining:
          storyMixBudgetPoints > 0
            ? Math.max(0, allocatedGraphicNovels - storyMixUsage.graphicNovels)
            : graphicNovelsLimit < 0
            ? -1
            : Math.max(
                0,
                graphicNovelsLimit -
                  (storyMixBudgetPoints > 0 ? storyMixUsage.graphicNovels : graphicNovelsUsed)
              ),
        plan_limit: graphicNovelsPlanLimit,
        bundle_bonus: graphicNovelsBundleBonus,
      },
      mixedStories: {
        used: storyMixBudgetPoints > 0 ? storyMixUsage.mixedStories : storiesUsed,
        limit: storyMixBudgetPoints > 0 ? allocatedMixedStories : mixedStoriesLimit,
        remaining:
          storyMixBudgetPoints > 0
            ? Math.max(0, allocatedMixedStories - storyMixUsage.mixedStories)
            : mixedStoriesLimit < 0
            ? -1
            : Math.max(
                0,
                mixedStoriesLimit -
                  (storyMixBudgetPoints > 0 ? storyMixUsage.mixedStories : storiesUsed)
              ),
        plan_limit: mixedStoriesPlanLimit,
        bundle_bonus: mixedStoriesPlanLimit > 0 ? bundleBonus.extraStories : 0,
      },
      audio: {
        used: audioUsed,
        limit: audioLimit,
        remaining: Math.max(0, audioLimit - audioUsed),
        plan_limit: audioPlanLimit,
        bundle_bonus: bundleBonus.extraAudio,
      },
      imagesPerStory: features.imagesPerStory,
      storyCharacterSelectionLimit: getStoryCharacterSelectionLimit(features.imagesPerStory),
      resetsAt: subscription.resetAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      paymentProvider: subscription.paymentProvider,
      enableRealPayments: config.features.enableRealPayments,
      ...(storyMixBudgetPoints > 0
        ? {
            storyMix: {
              budgetPoints: storyMixBudgetWithBundle,
              usedPoints: storyMixUsage.points,
              remainingPoints: storyMixRemainingPoints,
              weights: { story: 1_000, mixedStory: 5_030, graphicNovel: 8_370 },
              used: {
                stories: storyMixUsage.stories,
                mixedStories: storyMixUsage.mixedStories,
                graphicNovels: storyMixUsage.graphicNovels,
              },
              maximum: {
                stories: Math.floor(storyMixBudgetWithBundle / 1_000),
                mixedStories: Math.floor(storyMixBudgetWithBundle / 5_030),
                graphicNovels: Math.floor(storyMixBudgetWithBundle / 8_370),
              },
              allocation: {
                stories: allocatedStories,
                mixedStories: allocatedMixedStories,
                graphicNovels: allocatedGraphicNovels,
              },
            },
          }
        : {}),
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

router.put('/story-mix', requireAuth, requireParentSession, async (req: Request, res: Response) => {
  const parsed = StoryMixAllocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: 'Invalid story mix allocation' });
  }

  try {
    const { getPlanFeatures, getUserSubscription } = await import('../services/planService');
    const { getUsageEventsRepository } = await import('../repositories');
    const subscription = await getUserSubscription(req.user!.id);
    if (!subscription) {
      return res.status(403).json({ status: 'error', code: 'NO_SUBSCRIPTION' });
    }
    const features = await getPlanFeatures(req.user!.id);
    if (features.storyMixBudgetPoints <= 0) {
      return res.status(403).json({ status: 'error', code: 'STORY_MIX_NOT_AVAILABLE' });
    }
    const periodEnd = subscription.currentPeriodEnd ?? subscription.resetAt;
    const usage = await getUsageEventsRepository().getStoryMixUsageForPeriod(
      req.user!.id,
      subscription.currentPeriodStart,
      periodEnd
    );
    const { graphicNovels, mixedStories } = parsed.data;
    const usedPoints =
      usage.stories * 1_000 + graphicNovels * 8_370 + mixedStories * 5_030;
    if (
      graphicNovels < usage.graphicNovels ||
      mixedStories < usage.mixedStories ||
      usedPoints > features.storyMixBudgetPoints
    ) {
      return res.status(409).json({
        status: 'error',
        code: 'STORY_MIX_EXCEEDS_BUDGET',
        message: 'This story mix exceeds the remaining monthly budget',
      });
    }
    const { getPlanRepository } = await import('../repositories');
    await getPlanRepository().updateSubscription(req.user!.id, {
      metadata: {
        ...((subscription.metadata as Record<string, unknown> | null) ?? {}),
        storyMix: {
          graphicNovels,
          mixedStories,
          periodStart: subscription.currentPeriodStart.toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
    return res.json({ status: 'success' });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Update story mix failed');
    return res.status(500).json({ status: 'error', message: 'Failed to update story mix' });
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
router.delete(
  '/sessions/:sessionToken',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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
  }
);

// List user's story series (requires series_enabled feature)
router.get('/series', requireAuth, async (req: Request, res: Response) => {
  try {
    if (
      !childSessionCanReadFamilyStories({
        sessionMode: req.sessionMode,
        childProfileId: req.childProfileId,
        sessionScopes: req.sessionScopes,
      })
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Family stories are disabled for this child profile',
        code: 'CHILD_FAMILY_STORIES_DISABLED',
      });
    }

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
router.get(
  '/oauth-providers',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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
  }
);

// Link additional OAuth provider
router.post(
  '/oauth-providers',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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
  }
);

// Unlink OAuth provider
router.delete(
  '/oauth-providers/:provider',
  requireAuth,
  requireParentSession,
  async (req: Request, res: Response) => {
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
  }
);

export default router;
