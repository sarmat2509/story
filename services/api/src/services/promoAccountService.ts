import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '../db';
import {
  features,
  planFeatures,
  sessions,
  usageEvents,
  userSubscriptions,
  users,
  type User,
} from '../db/schema';
import { logger } from '../utils/logger';
import { notifyPromoAccountActivated } from './promoAccountTelegramAlertService';

export const PROMO_ACCOUNT_TYPE = 'promo';
export const PROMO_EXPIRED_REASON = 'promo_expired';
export const PROMO_ACCESS_DURATION_DAYS = 14;
export const PROMO_ACCESS_DURATION_MS = PROMO_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type PromoExpiryResult = {
  expiredAccountCount: number;
  revokedSessionCount: number;
};

export function getPromoStoryQuotaReservation(planLimit: number): number {
  if (!Number.isFinite(planLimit) || planLimit < 0) {
    throw new Error(`Promo accounts require a finite story limit; received ${planLimit}`);
  }
  // Reserve the higher half so an odd plan limit never grants more than 50%.
  return Math.ceil(planLimit / 2);
}

function extractNumericLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'limit' in value) {
    const limit = (value as { limit?: unknown }).limit;
    return typeof limit === 'number' && Number.isFinite(limit) ? limit : null;
  }
  return null;
}

export function getPromoAccessPeriod(startedAt = new Date()): {
  startedAt: Date;
  expiresAt: Date;
} {
  return {
    startedAt,
    expiresAt: new Date(startedAt.getTime() + PROMO_ACCESS_DURATION_MS),
  };
}

export function isPromoAccountExpired(
  user: Pick<User, 'accountType' | 'promoExpiresAt'>,
  now = new Date()
): boolean {
  return (
    user.accountType === PROMO_ACCOUNT_TYPE &&
    user.promoExpiresAt !== null &&
    user.promoExpiresAt <= now
  );
}

async function revokeSessionsForUsers(userIds: string[], now: Date): Promise<number> {
  if (userIds.length === 0) return 0;

  const revokedSessions = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(inArray(sessions.userId, userIds), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revokedSessions.length;
}

/**
 * Starts a promo period exactly once, when the account first successfully
 * authenticates. Pre-created invitations do not consume any of the 14 days.
 */
export async function activatePromoAccountOnFirstAuthentication(
  userId: string,
  now = new Date()
): Promise<{ startedAt: Date; expiresAt: Date } | null> {
  const period = getPromoAccessPeriod(now);

  const activation = await db.transaction(async (tx) => {
    const activatedAccounts = await tx
      .update(users)
      .set({
        promoStartedAt: period.startedAt,
        promoExpiresAt: period.expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(users.id, userId),
          eq(users.accountType, PROMO_ACCOUNT_TYPE),
          eq(users.status, 'active'),
          isNull(users.promoStartedAt)
        )
      )
      .returning({ id: users.id, email: users.email, displayName: users.displayName });

    const [activatedAccount] = activatedAccounts;
    if (!activatedAccount) return null;

    const [subscription] = await tx
      .select({ planId: userSubscriptions.planId })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .limit(1);
    if (!subscription) {
      throw new Error(`Promo account ${userId} does not have a subscription record`);
    }

    const [storyLimitFeature] = await tx
      .select({ value: planFeatures.value })
      .from(planFeatures)
      .innerJoin(features, eq(planFeatures.featureId, features.id))
      .where(
        and(eq(planFeatures.planId, subscription.planId), eq(features.slug, 'stories_per_month'))
      )
      .limit(1);
    const storyPlanLimit = extractNumericLimit(storyLimitFeature?.value);
    if (storyPlanLimit === null) {
      throw new Error(`Promo account ${userId} is missing a finite stories_per_month limit`);
    }
    const reservedStories = getPromoStoryQuotaReservation(storyPlanLimit);

    await tx
      .update(userSubscriptions)
      .set({
        storiesUsed: reservedStories,
        audioMinutesUsed: 0,
        resetAt: period.expiresAt,
        currentPeriodStart: period.startedAt,
        currentPeriodEnd: period.expiresAt,
        cancelAtPeriodEnd: true,
        updatedAt: now,
      })
      .where(eq(userSubscriptions.userId, userId));

    // Current quota enforcement aggregates usage_events, not storiesUsed. This
    // one baseline event leaves exactly half of Story World's story allowance.
    await tx.insert(usageEvents).values({
      userId,
      eventType: 'story_created',
      resourceType: 'story',
      quantity: reservedStories,
      metadata: {
        source: 'promo_initial_story_quota_reservation',
        storyMixPoints: 1_000,
      },
      createdAt: period.startedAt,
    });

    return { ...period, storyPlanLimit, reservedStories, account: activatedAccount };
  });

  if (!activation) return null;

  logger.info(
    {
      userId,
      storyPlanLimit: activation.storyPlanLimit,
      reservedStories: activation.reservedStories,
      ...period,
    },
    'Started promo access on first authentication'
  );
  void notifyPromoAccountActivated({
    email: activation.account.email,
    displayName: activation.account.displayName,
    expiresAt: activation.expiresAt,
    reservedStories: activation.reservedStories,
  });
  return { startedAt: activation.startedAt, expiresAt: activation.expiresAt };
}

/**
 * Idempotently ends one expired promo account. Called from the authentication
 * path as a hard deadline guard, so access never depends on scheduler timing.
 */
export async function suspendExpiredPromoAccount(userId: string, now = new Date()): Promise<boolean> {
  const expiredAccounts = await db
    .update(users)
    .set({
      status: 'suspended',
      suspendedAt: now,
      suspendedReason: PROMO_EXPIRED_REASON,
      suspendedByUserId: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(users.id, userId),
        eq(users.accountType, PROMO_ACCOUNT_TYPE),
        eq(users.status, 'active'),
        lte(users.promoExpiresAt, now)
      )
    )
    .returning({ id: users.id });

  if (expiredAccounts.length === 0) return false;
  const revokedSessionCount = await revokeSessionsForUsers([userId], now);
  logger.info({ userId, revokedSessionCount }, 'Expired promo account and revoked its sessions');
  return true;
}

/**
 * Ends time-limited promo accounts permanently. This deliberately does not
 * alter the subscription or assign the Free plan: the user account itself is
 * suspended, so no authentication or authenticated API access remains.
 */
export async function expireDuePromoAccounts(now = new Date()): Promise<PromoExpiryResult> {
  const expiredAccounts = await db
    .update(users)
    .set({
      status: 'suspended',
      suspendedAt: now,
      suspendedReason: PROMO_EXPIRED_REASON,
      suspendedByUserId: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(users.accountType, PROMO_ACCOUNT_TYPE),
        eq(users.status, 'active'),
        lte(users.promoExpiresAt, now)
      )
    )
    .returning({ id: users.id });

  const userIds = expiredAccounts.map((account) => account.id);
  if (userIds.length === 0) {
    return { expiredAccountCount: 0, revokedSessionCount: 0 };
  }

  const revokedSessionCount = await revokeSessionsForUsers(userIds, now);

  logger.info(
    {
      userIds,
      expiredAccountCount: userIds.length,
      revokedSessionCount,
    },
    'Expired promo accounts and revoked their sessions'
  );

  return {
    expiredAccountCount: userIds.length,
    revokedSessionCount,
  };
}
