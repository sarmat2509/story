import { getPlanRepository, getUserRepository } from '../repositories';
import { changePlan, getUserSubscription, initializeUserSubscription } from './planService';
import { getUserById } from './userService';
import { getUsageForPeriod, recordUsageEvent } from './usageEventsService';

export async function updateAdminUserSettings(params: {
  userId: string;
  actorUserId?: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  suspendedReason?: string | null;
  planSlug?: string;
  storiesUsedCurrentPeriod?: number;
  graphicNovelsUsedCurrentPeriod?: number;
  audioStoriesUsedCurrentPeriod?: number;
}) {
  const {
    userId,
    actorUserId,
    role,
    status,
    suspendedReason,
    planSlug,
    storiesUsedCurrentPeriod,
    graphicNovelsUsedCurrentPeriod,
    audioStoriesUsedCurrentPeriod,
  } = params;

  const existingUser = await getUserById(userId);
  if (!existingUser) {
    return null;
  }

  let updatedUser = existingUser;
  if (role && role !== existingUser.role) {
    updatedUser = await getUserRepository().updateRole(userId, role);
  }

  if (status && status !== existingUser.status) {
    updatedUser = await getUserRepository().updateStatus(userId, {
      status,
      suspendedReason,
      suspendedByUserId: actorUserId,
    });
  } else if (status === 'suspended' && suspendedReason !== undefined) {
    updatedUser = await getUserRepository().updateStatus(userId, {
      status,
      suspendedReason,
      suspendedByUserId: actorUserId,
    });
  }

  if (planSlug) {
    const subscription = await getUserSubscription(userId);
    if (subscription) {
      await changePlan(userId, planSlug);
    } else {
      await initializeUserSubscription(userId, planSlug);
    }
  }

  if (
    storiesUsedCurrentPeriod !== undefined ||
    graphicNovelsUsedCurrentPeriod !== undefined ||
    audioStoriesUsedCurrentPeriod !== undefined
  ) {
    let subscription = await getUserSubscription(userId);
    if (!subscription) {
      await initializeUserSubscription(userId, 'free');
      subscription = await getUserSubscription(userId);
    }

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const planRepo = getPlanRepository();
    const currentPeriodStart = subscription.currentPeriodStart;
    const currentPeriodEnd = subscription.currentPeriodEnd ?? subscription.resetAt ?? new Date();
    const updateData: Partial<{
      storiesUsed: number;
      audioMinutesUsed: number;
    }> = {};

    if (storiesUsedCurrentPeriod !== undefined) {
      const currentStoriesUsed = await getUsageForPeriod(
        userId,
        currentPeriodStart,
        currentPeriodEnd,
        'story_created'
      );
      const storiesDelta = storiesUsedCurrentPeriod - currentStoriesUsed;
      if (storiesDelta !== 0) {
        await recordUsageEvent(userId, 'story_created', storiesDelta, {
          metadata: {
            source: 'admin_adjustment',
            adjustedByUserId: actorUserId ?? null,
            targetUsage: storiesUsedCurrentPeriod,
          },
        });
      }
      updateData.storiesUsed = storiesUsedCurrentPeriod;
    }

    if (graphicNovelsUsedCurrentPeriod !== undefined) {
      const currentGraphicNovelsUsed = await getUsageForPeriod(
        userId,
        currentPeriodStart,
        currentPeriodEnd,
        'graphic_novel_created'
      );
      const graphicNovelsDelta = graphicNovelsUsedCurrentPeriod - currentGraphicNovelsUsed;
      if (graphicNovelsDelta !== 0) {
        await recordUsageEvent(userId, 'graphic_novel_created', graphicNovelsDelta, {
          metadata: {
            source: 'admin_adjustment',
            adjustedByUserId: actorUserId ?? null,
            targetUsage: graphicNovelsUsedCurrentPeriod,
          },
        });
      }
    }

    if (audioStoriesUsedCurrentPeriod !== undefined) {
      const currentAudioStoriesUsed = await getUsageForPeriod(
        userId,
        currentPeriodStart,
        currentPeriodEnd,
        'audio_synthesized'
      );
      const audioStoriesDelta = audioStoriesUsedCurrentPeriod - currentAudioStoriesUsed;
      if (audioStoriesDelta !== 0) {
        await recordUsageEvent(userId, 'audio_synthesized', audioStoriesDelta, {
          metadata: {
            source: 'admin_adjustment',
            adjustedByUserId: actorUserId ?? null,
            targetUsage: audioStoriesUsedCurrentPeriod,
          },
        });
      }
      updateData.audioMinutesUsed = audioStoriesUsedCurrentPeriod;
    }

    if (Object.keys(updateData).length > 0) {
      await planRepo.updateSubscription(userId, updateData);
    }
  }

  return updatedUser;
}
