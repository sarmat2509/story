import { and, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm';
import { getStoryRepository } from '../repositories';
import * as schema from '../db/schema';
import { logger } from '../utils/logger';
import {
  getQuotaReservationReleaseQuantity,
  truncateQuotaReleaseErrorMessage,
  type QuotaReservationReleaseReason,
} from './quotaReservationReleaseUtils';
import { resolveActiveSubscriptionPeriod } from './subscriptionPeriodService';
import { getActivatedConditionalQuotaExtension } from './conditionalQuotaExtensionService';
import { readStoryMixBudgetPoints, storyMixPointsForSource } from './storyMixBudgetService';

export type StoryQuotaReservationSource =
  | 'wizard'
  | 'graphic_novel'
  | 'mixed_story'
  | 'instant'
  | 'child_mode'
  | 'continuation'
  | 'scheduled_continuation'
  | 'scheduled_story';

export interface StoryQuotaCalculationInput {
  planLimit: number | null;
  bundleBonus: number;
  currentUsage: number;
  requestedQty?: number;
}

export interface StoryQuotaCalculation {
  allowed: boolean;
  effectiveLimit: number | null;
  remaining: number | null;
}

export class StoryQuotaError extends Error {
  readonly statusCode: number;
  readonly code: 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_PERIOD_EXPIRED' | 'STORY_LIMIT_EXCEEDED';
  readonly featureSlug = 'stories_per_month';
  readonly limit: number | null;
  readonly used: number;
  readonly remaining: number | null;
  readonly resetsAt: Date | null;

  constructor(params: {
    code: 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_PERIOD_EXPIRED' | 'STORY_LIMIT_EXCEEDED';
    message: string;
    statusCode: number;
    limit?: number | null;
    used?: number;
    remaining?: number | null;
    resetsAt?: Date | null;
  }) {
    super(params.message);
    this.name = 'StoryQuotaError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.limit = params.limit ?? null;
    this.used = params.used ?? 0;
    this.remaining = params.remaining ?? null;
    this.resetsAt = params.resetsAt ?? null;
  }
}

export function isStoryQuotaError(error: unknown): error is StoryQuotaError {
  return error instanceof StoryQuotaError;
}

export function calculateStoryQuota(input: StoryQuotaCalculationInput): StoryQuotaCalculation {
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

/**
 * Atomically reserves one monthly story credit and creates the pending request.
 *
 * Story credits are consumed when the API accepts the request for generation.
 * This intentionally counts pending work so concurrent direct API calls cannot
 * overspend the monthly quota before expensive jobs are queued.
 */
export async function createStoryRequestWithQuotaReservation(
  userId: string,
  data: schema.NewStoryRequest,
  options: {
    source: StoryQuotaReservationSource;
  }
): Promise<{ requestId: string; remaining: number | null; limit: number | null }> {
  const storyRepo = getStoryRepository();

  return storyRepo.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`story_quota:${userId}`})::bigint)`);

    const [subscription] = await tx
      .select({
        planId: schema.userSubscriptions.planId,
        currentPeriodStart: schema.userSubscriptions.currentPeriodStart,
        currentPeriodEnd: schema.userSubscriptions.currentPeriodEnd,
        resetAt: schema.userSubscriptions.resetAt,
        paymentProvider: schema.userSubscriptions.paymentProvider,
        metadata: schema.userSubscriptions.metadata,
      })
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.userId, userId))
      .limit(1);

    if (!subscription) {
      throw new StoryQuotaError({
        code: 'NO_SUBSCRIPTION',
        message: 'No active subscription found',
        statusCode: 403,
      });
    }

    const activePeriod = resolveActiveSubscriptionPeriod(subscription);
    if (activePeriod.expiredStripePeriod) {
      throw new StoryQuotaError({
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

    const featureRows = await tx
      .select({
        slug: schema.features.slug,
        value: schema.planFeatures.value,
      })
      .from(schema.planFeatures)
      .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
      .where(
        and(
          eq(schema.planFeatures.planId, subscription.planId),
          inArray(schema.features.slug, ['stories_per_month', 'story_mix_budget_points'])
        )
      );

    const featureValues = new Map(featureRows.map((row) => [row.slug, row.value]));
    const storyPlanLimit = extractLimit(
      featureValues.get('stories_per_month') ?? featureRows[0]?.value
    );
    const storyMixBudgetPoints = readStoryMixBudgetPoints(
      featureValues.get('story_mix_budget_points')
    );

    const [bundleRow] = await tx
      .select({
        extraStories: sql<number>`COALESCE(SUM(${schema.userBundleGrants.extraStories}), 0)::integer`,
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
        storyMixPoints: sql<number>`COALESCE(SUM(
          ${schema.usageEvents.quantity} * COALESCE(
            NULLIF(${schema.usageEvents.metadata}->>'storyMixPoints', '')::integer,
            CASE ${schema.usageEvents.metadata}->>'reservationSource'
              WHEN 'graphic_novel' THEN 8370
              WHEN 'mixed_story' THEN 5030
              ELSE 1000
            END
          )
        ), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, 'story_created'),
          gte(schema.usageEvents.createdAt, periodStart),
          lt(schema.usageEvents.createdAt, periodEnd)
        )
      );

    const bundleBonus = Number(bundleRow?.extraStories ?? 0);
    const currentUsage = Number(usageRow?.total ?? 0);
    const currentStoryMixPoints = Number(usageRow?.storyMixPoints ?? 0);
    const conditionalExtension = getActivatedConditionalQuotaExtension({
      metadata: subscription.metadata as Record<string, unknown> | null,
      featureSlug: 'stories_per_month',
      currentUsage,
      periodStart,
      periodEnd,
    });
    const usingStoryMixBudget = storyMixBudgetPoints > 0;
    const quota = calculateStoryQuota({
      planLimit: usingStoryMixBudget ? storyMixBudgetPoints : storyPlanLimit,
      bundleBonus: usingStoryMixBudget
        ? (bundleBonus + conditionalExtension) * 1_000
        : bundleBonus + conditionalExtension,
      currentUsage: usingStoryMixBudget ? currentStoryMixPoints : currentUsage,
      requestedQty: usingStoryMixBudget ? storyMixPointsForSource(options.source) : 1,
    });

    if (!quota.allowed) {
      throw new StoryQuotaError({
        code: 'STORY_LIMIT_EXCEEDED',
        message: 'You have reached your monthly story limit',
        statusCode: 429,
        limit: quota.effectiveLimit,
        used: currentUsage,
        remaining: quota.remaining,
        resetsAt: periodEnd,
      });
    }

    const [request] = await tx
      .insert(schema.storyRequests)
      .values(data)
      .returning({ id: schema.storyRequests.id });

    if (!request) {
      throw new Error('Failed to create story request');
    }

    await tx.insert(schema.usageEvents).values({
      userId,
      childProfileId: data.childProfileId ?? null,
      eventType: 'story_created',
      resourceType: 'story',
      quantity: 1,
      metadata: {
        requestId: request.id,
        quotaReservation: true,
        reservationSource: options.source,
        storyMixPoints: storyMixPointsForSource(options.source),
        reservedAt: new Date().toISOString(),
        reservationBehavior: 'consumed_on_queue_acceptance',
      },
    });

    logger.info(
      {
        userId,
        requestId: request.id,
        source: options.source,
        limit: quota.effectiveLimit,
        usedBeforeReservation: usingStoryMixBudget ? currentStoryMixPoints : currentUsage,
        conditionalExtension,
      },
      'Reserved monthly story quota'
    );

    return {
      requestId: request.id,
      limit: quota.effectiveLimit,
      remaining:
        quota.remaining === null
          ? null
          : Math.max(0, quota.remaining - (usingStoryMixBudget ? storyMixPointsForSource(options.source) : 1)),
    };
  });
}

export async function releaseStoryQuotaReservationForRequest(
  requestId: string,
  options: {
    reason: QuotaReservationReleaseReason;
    errorMessage?: string;
  }
): Promise<{
  released: boolean;
  netReserved: number;
  userId: string | null;
  skippedReason?: 'request_not_found' | 'story_already_created' | 'no_active_reservation';
}> {
  const storyRepo = getStoryRepository();

  return storyRepo.transaction(async (tx) => {
    const [request] = await tx
      .select({
        id: schema.storyRequests.id,
        userId: schema.storyRequests.userId,
        childProfileId: schema.storyRequests.childProfileId,
        status: schema.storyRequests.status,
        storyId: schema.storyRequests.storyId,
      })
      .from(schema.storyRequests)
      .where(eq(schema.storyRequests.id, requestId))
      .limit(1);

    if (!request) {
      return {
        released: false,
        netReserved: 0,
        userId: null,
        skippedReason: 'request_not_found' as const,
      };
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`story_quota:${request.userId}`})::bigint)`);

    const [completedStory] = await tx
      .select({
        id: schema.stories.id,
        title: schema.stories.title,
        fullText: schema.stories.fullText,
      })
      .from(schema.stories)
      .where(eq(schema.stories.storyRequestId, requestId))
      .limit(1);

    if (
      completedStory &&
      completedStory.title !== 'Generating...' &&
      completedStory.fullText.trim().length > 0
    ) {
      logger.info(
        {
          requestId,
          userId: request.userId,
          storyId: completedStory.id,
          reason: options.reason,
        },
        'Skipped story quota reservation release because story was already created'
      );
      return {
        released: false,
        netReserved: 0,
        userId: request.userId,
        skippedReason: 'story_already_created' as const,
      };
    }

    const [reservationRow] = await tx
      .select({
        netReserved: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
        storyMixPoints: sql<number>`COALESCE(MAX(
          NULLIF(${schema.usageEvents.metadata}->>'storyMixPoints', '')::integer
        ), 1000)::integer`,
        reservationSource: sql<string | null>`MAX(${schema.usageEvents.metadata}->>'reservationSource')`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, request.userId),
          eq(schema.usageEvents.eventType, 'story_created'),
          sql`(${schema.usageEvents.metadata}->>'requestId') = ${requestId}`,
          sql`(${schema.usageEvents.metadata}->>'quotaReservation') = 'true'`
        )
      );

    const netReserved = Number(reservationRow?.netReserved ?? 0);
    const storyMixPoints = Number(reservationRow?.storyMixPoints ?? 1_000);
    const releaseQuantity = getQuotaReservationReleaseQuantity(netReserved);
    if (releaseQuantity === 0) {
      return {
        released: false,
        netReserved,
        userId: request.userId,
        skippedReason: 'no_active_reservation' as const,
      };
    }

    const errorMessage = truncateQuotaReleaseErrorMessage(options.errorMessage);
    await tx.insert(schema.usageEvents).values({
      userId: request.userId,
      childProfileId: request.childProfileId ?? null,
      eventType: 'story_created',
      resourceType: 'story',
      quantity: releaseQuantity,
      metadata: {
        requestId,
        ...(request.storyId && { storyId: request.storyId }),
        quotaReservation: true,
        quotaReservationRelease: true,
        reservationSource: reservationRow?.reservationSource ?? 'wizard',
        storyMixPoints,
        releaseReason: options.reason,
        releasedAt: new Date().toISOString(),
        reservationBehavior: 'released_on_downstream_failure',
        originalRequestStatus: request.status,
        ...(errorMessage && { errorMessage }),
      },
    });

    logger.info(
      {
        requestId,
        userId: request.userId,
        netReservedBeforeRelease: netReserved,
        releaseQuantity,
        reason: options.reason,
      },
      'Released monthly story quota reservation'
    );

    return {
      released: true,
      netReserved,
      userId: request.userId,
    };
  });
}
