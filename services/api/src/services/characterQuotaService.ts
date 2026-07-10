import { randomUUID } from 'crypto';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getCharacterRepository } from '../repositories';
import * as schema from '../db/schema';
import { logger } from '../utils/logger';
import {
  getQuotaReservationReleaseQuantity,
  truncateQuotaReleaseErrorMessage,
  type QuotaReservationReleaseReason,
} from './quotaReservationReleaseUtils';
import { resolveActiveSubscriptionPeriod } from './subscriptionPeriodService';
import { recordUsageEvent } from './usageEventsService';

export const CHARACTER_QUOTA_FEATURE_SLUG = 'characters_per_month';
export const CHARACTER_USAGE_EVENT = 'character_generated';

export interface CharacterQuotaCalculationInput {
  planLimit: number;
  currentUsage: number;
  requestedQty?: number;
}

export interface CharacterQuotaCalculation {
  allowed: boolean;
  effectiveLimit: number;
  remaining: number;
}

export class CharacterQuotaError extends Error {
  readonly statusCode: number;
  readonly code: 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_PERIOD_EXPIRED' | 'CHARACTER_LIMIT_EXCEEDED';
  readonly featureSlug = CHARACTER_QUOTA_FEATURE_SLUG;
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly resetsAt: Date | null;

  constructor(params: {
    code: 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_PERIOD_EXPIRED' | 'CHARACTER_LIMIT_EXCEEDED';
    message: string;
    statusCode: number;
    limit?: number;
    used?: number;
    remaining?: number;
    resetsAt?: Date | null;
  }) {
    super(params.message);
    this.name = 'CharacterQuotaError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.limit = params.limit ?? 0;
    this.used = params.used ?? 0;
    this.remaining = params.remaining ?? 0;
    this.resetsAt = params.resetsAt ?? null;
  }
}

export function isCharacterQuotaError(error: unknown): error is CharacterQuotaError {
  return error instanceof CharacterQuotaError;
}

export function calculateCharacterQuota(
  input: CharacterQuotaCalculationInput
): CharacterQuotaCalculation {
  const requestedQty = input.requestedQty ?? 1;
  const effectiveLimit = Math.max(0, input.planLimit);
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

export async function reserveManualCharacterQuota(
  userId: string,
  options: {
    childProfileId?: string | null;
    source: 'parent' | 'child';
    characterName?: string | null;
    characterType?: string | null;
  }
): Promise<{ reservationId: string; remaining: number; limit: number }> {
  const characterRepo = getCharacterRepository();
  const reservationId = randomUUID();

  return characterRepo.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`character_quota:${userId}`})::bigint)`);

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
      throw new CharacterQuotaError({
        code: 'NO_SUBSCRIPTION',
        message: 'No active subscription found',
        statusCode: 403,
      });
    }

    const activePeriod = resolveActiveSubscriptionPeriod(subscription);
    if (activePeriod.expiredStripePeriod) {
      throw new CharacterQuotaError({
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
          eq(schema.features.slug, CHARACTER_QUOTA_FEATURE_SLUG)
        )
      )
      .limit(1);

    const planLimit = extractLimit(featureRow?.value) ?? 3;

    const [usageRow] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, CHARACTER_USAGE_EVENT),
          gte(schema.usageEvents.createdAt, periodStart),
          lt(schema.usageEvents.createdAt, periodEnd)
        )
      );

    const currentUsage = Number(usageRow?.total ?? 0);
    const quota = calculateCharacterQuota({
      planLimit,
      currentUsage,
      requestedQty: 1,
    });

    if (!quota.allowed) {
      throw new CharacterQuotaError({
        code: 'CHARACTER_LIMIT_EXCEEDED',
        message: 'You have reached your monthly character limit',
        statusCode: 429,
        limit: quota.effectiveLimit,
        used: currentUsage,
        remaining: quota.remaining,
        resetsAt: periodEnd,
      });
    }

    await tx.insert(schema.usageEvents).values({
      userId,
      childProfileId: options.childProfileId ?? null,
      eventType: CHARACTER_USAGE_EVENT,
      resourceType: 'character',
      quantity: 1,
      metadata: {
        reservationId,
        quotaReservation: true,
        manualCharacter: true,
        reservationSource: options.source,
        reservedAt: new Date().toISOString(),
        reservationBehavior: 'consumed_on_character_generation_acceptance',
        ...(options.characterName && { characterName: options.characterName }),
        ...(options.characterType && { characterType: options.characterType }),
      },
    });

    logger.info(
      {
        userId,
        reservationId,
        source: options.source,
        limit: quota.effectiveLimit,
        usedBeforeReservation: currentUsage,
      },
      'Reserved monthly manual character quota'
    );

    return {
      reservationId,
      limit: quota.effectiveLimit,
      remaining: Math.max(0, quota.remaining - 1),
    };
  });
}

export async function recordInstantCharacterQuotaUsage(
  userId: string,
  options: {
    childProfileId?: string | null;
    storyId?: string | null;
    storyRequestId?: string | null;
    characterId: string;
    characterName?: string | null;
    characterType?: string | null;
  }
): Promise<void> {
  await recordUsageEvent(userId, CHARACTER_USAGE_EVENT, 1, {
    childProfileId: options.childProfileId ?? null,
    metadata: {
      instantCharacter: true,
      quotaEnforced: false,
      quotaBehavior: 'tracked_without_blocking_instant_story_creation',
      characterId: options.characterId,
      recordedAt: new Date().toISOString(),
      ...(options.storyId && { storyId: options.storyId }),
      ...(options.storyRequestId && { storyRequestId: options.storyRequestId }),
      ...(options.characterName && { characterName: options.characterName }),
      ...(options.characterType && { characterType: options.characterType }),
    },
  });

  logger.info(
    {
      userId,
      storyId: options.storyId,
      storyRequestId: options.storyRequestId,
      characterId: options.characterId,
      characterType: options.characterType,
    },
    'Recorded instant character quota usage without enforcing monthly limit'
  );
}

export async function releaseManualCharacterQuotaReservation(
  userId: string,
  reservationId: string,
  options: {
    reason: QuotaReservationReleaseReason;
    errorMessage?: string;
    childProfileId?: string | null;
  }
): Promise<{ released: boolean; netReserved: number; skippedReason?: 'no_active_reservation' }> {
  const characterRepo = getCharacterRepository();

  return characterRepo.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`character_quota:${userId}`})::bigint)`);

    const [reservationRow] = await tx
      .select({
        netReserved: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, CHARACTER_USAGE_EVENT),
          sql`(${schema.usageEvents.metadata}->>'reservationId') = ${reservationId}`,
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
      eventType: CHARACTER_USAGE_EVENT,
      resourceType: 'character',
      quantity: releaseQuantity,
      metadata: {
        reservationId,
        quotaReservation: true,
        quotaReservationRelease: true,
        manualCharacter: true,
        releaseReason: options.reason,
        releasedAt: new Date().toISOString(),
        reservationBehavior: 'released_on_downstream_failure',
        ...(errorMessage && { errorMessage }),
      },
    });

    logger.info(
      {
        userId,
        reservationId,
        netReservedBeforeRelease: netReserved,
        releaseQuantity,
        reason: options.reason,
      },
      'Released monthly manual character quota reservation'
    );

    return {
      released: true,
      netReserved,
    };
  });
}
