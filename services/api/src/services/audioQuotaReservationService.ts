import { and, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { getStoryRepository } from '../repositories';
import * as schema from '../db/schema';
import { logger } from '../utils/logger';
import {
  getQuotaReservationReleaseQuantity,
  truncateQuotaReleaseErrorMessage,
  type QuotaReservationReleaseReason,
} from './quotaReservationReleaseUtils';
import { resolveActiveSubscriptionPeriod } from './subscriptionPeriodService';

export type AudioQuotaReservationSource = 'manual';

export interface AudioQuotaCalculationInput {
  planLimit: number | null;
  bundleBonus: number;
  currentUsage: number;
  alreadyReservedForStory?: boolean;
  requestedQty?: number;
}

export interface AudioQuotaCalculation {
  allowed: boolean;
  effectiveLimit: number | null;
  remaining: number | null;
}

export class AudioQuotaError extends Error {
  readonly statusCode: number;
  readonly code:
    | 'NO_SUBSCRIPTION'
    | 'SUBSCRIPTION_PERIOD_EXPIRED'
    | 'AUDIO_NOT_AVAILABLE'
    | 'AUDIO_LIMIT_EXCEEDED';
  readonly featureSlug = 'audio_stories_per_month';
  readonly limit: number | null;
  readonly used: number;
  readonly remaining: number | null;
  readonly resetsAt: Date | null;

  constructor(params: {
    code:
      | 'NO_SUBSCRIPTION'
      | 'SUBSCRIPTION_PERIOD_EXPIRED'
      | 'AUDIO_NOT_AVAILABLE'
      | 'AUDIO_LIMIT_EXCEEDED';
    message: string;
    statusCode: number;
    limit?: number | null;
    used?: number;
    remaining?: number | null;
    resetsAt?: Date | null;
  }) {
    super(params.message);
    this.name = 'AudioQuotaError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.limit = params.limit ?? null;
    this.used = params.used ?? 0;
    this.remaining = params.remaining ?? null;
    this.resetsAt = params.resetsAt ?? null;
  }
}

export function isAudioQuotaError(error: unknown): error is AudioQuotaError {
  return error instanceof AudioQuotaError;
}

export function calculateAudioQuota(input: AudioQuotaCalculationInput): AudioQuotaCalculation {
  if (input.alreadyReservedForStory) {
    const effectiveLimit =
      input.planLimit === null ? null : Math.max(0, input.planLimit + input.bundleBonus);
    return {
      allowed: true,
      effectiveLimit,
      remaining: effectiveLimit === null ? null : Math.max(0, effectiveLimit - input.currentUsage),
    };
  }

  if (input.planLimit === null) {
    return {
      allowed: true,
      effectiveLimit: null,
      remaining: null,
    };
  }

  const requestedQty = input.requestedQty ?? 1;
  const effectiveLimit = Math.max(0, input.planLimit + input.bundleBonus);
  const remaining = Math.max(0, effectiveLimit - input.currentUsage);

  return {
    allowed: remaining >= requestedQty,
    effectiveLimit,
    remaining,
  };
}

function extractLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === 'object' && 'limit' in value) {
    const raw = (value as { limit?: unknown }).limit;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
  }
  return null;
}

export async function reserveAudioQuotaForStory(
  userId: string,
  storyId: string,
  options: {
    source: AudioQuotaReservationSource;
    childProfileId?: string | null;
  }
): Promise<{
  reserved: boolean;
  alreadyReservedForStory: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetsAt: Date | null;
}> {
  const storyRepo = getStoryRepository();

  return storyRepo.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`audio_quota:${userId}`})::bigint)`);

    const [subscription] = await tx
      .select({
        planId: schema.userSubscriptions.planId,
        currentPeriodStart: schema.userSubscriptions.currentPeriodStart,
        currentPeriodEnd: schema.userSubscriptions.currentPeriodEnd,
        resetAt: schema.userSubscriptions.resetAt,
        paymentProvider: schema.userSubscriptions.paymentProvider,
      })
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.userId, userId))
      .limit(1);

    if (!subscription) {
      throw new AudioQuotaError({
        code: 'NO_SUBSCRIPTION',
        message: 'No active subscription found',
        statusCode: 403,
      });
    }

    const activePeriod = resolveActiveSubscriptionPeriod(subscription);
    if (activePeriod.expiredStripePeriod) {
      throw new AudioQuotaError({
        code: 'SUBSCRIPTION_PERIOD_EXPIRED',
        message: 'Subscription billing period is expired',
        statusCode: 403,
        resetsAt: activePeriod.periodEnd,
      });
    }
    if (activePeriod.shouldReset && activePeriod.resetPatch) {
      await tx
        .update(schema.userSubscriptions)
        .set(activePeriod.resetPatch)
        .where(eq(schema.userSubscriptions.userId, userId));
    }

    const periodStart = activePeriod.periodStart;
    const periodEnd = activePeriod.periodEnd;

    const [featureRow] = await tx
      .select({
        value: schema.planFeatures.value,
      })
      .from(schema.planFeatures)
      .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
      .where(
        and(
          eq(schema.planFeatures.planId, subscription.planId),
          eq(schema.features.slug, 'audio_stories_per_month')
        )
      )
      .limit(1);

    const planLimit = extractLimit(featureRow?.value);
    if (planLimit !== null && planLimit <= 0) {
      throw new AudioQuotaError({
        code: 'AUDIO_NOT_AVAILABLE',
        message: 'Audio generation not available in your plan',
        statusCode: 403,
        limit: 0,
        resetsAt: periodEnd,
      });
    }

    const [storyUsageRow] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, 'audio_synthesized'),
          gte(schema.usageEvents.createdAt, periodStart),
          lt(schema.usageEvents.createdAt, periodEnd),
          sql`(${schema.usageEvents.metadata}->>'storyId') = ${storyId}`
        )
      );

    const alreadyReservedForStory = Number(storyUsageRow?.total ?? 0) > 0;

    const [bundleRow] = await tx
      .select({
        extraAudio: sql<number>`COALESCE(SUM(${schema.userBundleGrants.extraAudio}), 0)::integer`,
      })
      .from(schema.userBundleGrants)
      .where(
        and(
          eq(schema.userBundleGrants.userId, userId),
          lt(schema.userBundleGrants.subscriptionPeriodStart, periodEnd),
          gt(schema.userBundleGrants.subscriptionPeriodEnd, periodStart)
        )
      );

    const [usageRow] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, 'audio_synthesized'),
          gte(schema.usageEvents.createdAt, periodStart),
          lt(schema.usageEvents.createdAt, periodEnd)
        )
      );

    const bundleBonus = Number(bundleRow?.extraAudio ?? 0);
    const currentUsage = Number(usageRow?.total ?? 0);
    const quota = calculateAudioQuota({
      planLimit,
      bundleBonus,
      currentUsage,
      alreadyReservedForStory,
      requestedQty: 1,
    });

    if (!quota.allowed) {
      throw new AudioQuotaError({
        code: 'AUDIO_LIMIT_EXCEEDED',
        message: 'You have reached your monthly audio story limit',
        statusCode: 429,
        limit: quota.effectiveLimit,
        used: currentUsage,
        remaining: quota.remaining,
        resetsAt: periodEnd,
      });
    }

    if (alreadyReservedForStory) {
      return {
        reserved: false,
        alreadyReservedForStory: true,
        limit: quota.effectiveLimit,
        used: currentUsage,
        remaining: quota.remaining,
        resetsAt: periodEnd,
      };
    }

    await tx.insert(schema.usageEvents).values({
      userId,
      childProfileId: options.childProfileId ?? null,
      eventType: 'audio_synthesized',
      resourceType: 'audio',
      quantity: 1,
      metadata: {
        storyId,
        quotaReservation: true,
        reservationSource: options.source,
        reservedAt: new Date().toISOString(),
        reservationBehavior: 'consumed_on_queue_acceptance',
      },
    });

    logger.info(
      {
        userId,
        storyId,
        limit: quota.effectiveLimit,
        usedBeforeReservation: currentUsage,
        remainingAfterReservation:
          quota.remaining === null ? null : Math.max(0, quota.remaining - 1),
        source: options.source,
      },
      'Reserved monthly audio story quota'
    );

    return {
      reserved: true,
      alreadyReservedForStory: false,
      limit: quota.effectiveLimit,
      used: currentUsage + 1,
      remaining: quota.remaining === null ? null : Math.max(0, quota.remaining - 1),
      resetsAt: periodEnd,
    };
  });
}

export async function releaseAudioQuotaReservationForStory(
  userId: string,
  storyId: string,
  options: {
    reason: QuotaReservationReleaseReason;
    errorMessage?: string;
    childProfileId?: string | null;
  }
): Promise<{
  released: boolean;
  netReserved: number;
  skippedReason?: 'no_active_reservation';
}> {
  const storyRepo = getStoryRepository();

  return storyRepo.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`audio_quota:${userId}`})::bigint)`);

    const [reservationRow] = await tx
      .select({
        netReserved: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, 'audio_synthesized'),
          sql`(${schema.usageEvents.metadata}->>'storyId') = ${storyId}`,
          sql`(${schema.usageEvents.metadata}->>'quotaReservation') = 'true'`
        )
      );

    const netReserved = Number(reservationRow?.netReserved ?? 0);
    const releaseQuantity = getQuotaReservationReleaseQuantity(netReserved);
    if (releaseQuantity === 0) {
      return {
        released: false,
        netReserved,
        skippedReason: 'no_active_reservation' as const,
      };
    }

    const errorMessage = truncateQuotaReleaseErrorMessage(options.errorMessage);
    await tx.insert(schema.usageEvents).values({
      userId,
      childProfileId: options.childProfileId ?? null,
      eventType: 'audio_synthesized',
      resourceType: 'audio',
      quantity: releaseQuantity,
      metadata: {
        storyId,
        quotaReservation: true,
        quotaReservationRelease: true,
        releaseReason: options.reason,
        releasedAt: new Date().toISOString(),
        reservationBehavior: 'released_on_downstream_failure',
        ...(errorMessage && { errorMessage }),
      },
    });

    logger.info(
      {
        userId,
        storyId,
        netReservedBeforeRelease: netReserved,
        releaseQuantity,
        reason: options.reason,
      },
      'Released monthly audio story quota reservation'
    );

    return {
      released: true,
      netReserved,
    };
  });
}
