import { and, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { getStoryRepository } from '../repositories';
import * as schema from '../db/schema';
import { logger } from '../utils/logger';

export type StoryQuotaReservationSource =
  | 'wizard'
  | 'instant'
  | 'continuation'
  | 'scheduled_continuation';

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
  readonly code: 'NO_SUBSCRIPTION' | 'STORY_LIMIT_EXCEEDED';
  readonly featureSlug = 'stories_per_month';
  readonly limit: number | null;
  readonly used: number;
  readonly remaining: number | null;
  readonly resetsAt: Date | null;

  constructor(params: {
    code: 'NO_SUBSCRIPTION' | 'STORY_LIMIT_EXCEEDED';
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

    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd ?? subscription.resetAt;

    const [featureRow] = await tx
      .select({
        value: schema.planFeatures.value,
      })
      .from(schema.planFeatures)
      .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
      .where(
        and(
          eq(schema.planFeatures.planId, subscription.planId),
          eq(schema.features.slug, 'stories_per_month')
        )
      )
      .limit(1);

    const planLimit = extractLimit(featureRow?.value);

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
    const quota = calculateStoryQuota({
      planLimit,
      bundleBonus,
      currentUsage,
      requestedQty: 1,
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
        usedBeforeReservation: currentUsage,
      },
      'Reserved monthly story quota'
    );

    return {
      requestId: request.id,
      limit: quota.effectiveLimit,
      remaining: quota.remaining === null ? null : Math.max(0, quota.remaining - 1),
    };
  });
}
