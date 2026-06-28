import { and, eq, sql } from 'drizzle-orm';
import { getPlanRepository, getStoryRepository } from '../repositories';
import * as schema from '../db/schema';
import { getPlanFeatures } from './planService';
import { resolveActiveSubscriptionPeriod } from './subscriptionPeriodService';
import { getUsageForPeriod } from './usageEventsService';
import {
  getQuotaReservationReleaseQuantity,
  truncateQuotaReleaseErrorMessage,
  type QuotaReservationReleaseReason,
} from './quotaReservationReleaseUtils';

export const GRAPHIC_NOVEL_USAGE_EVENT = 'graphic_novel_created';

export class GraphicNovelQuotaError extends Error {
  readonly statusCode = 403;
  readonly code = 'GRAPHIC_NOVEL_LIMIT_REACHED';

  constructor(
    message: string,
    readonly details: { used: number; limit: number }
  ) {
    super(message);
    this.name = 'GraphicNovelQuotaError';
  }
}

export function isGraphicNovelQuotaError(error: unknown): error is GraphicNovelQuotaError {
  return error instanceof GraphicNovelQuotaError;
}

export function calculateGraphicNovelQuota(params: {
  limit: number;
  used: number;
  requestedQty?: number;
}): { allowed: boolean; limit: number | null; used: number; remaining: number | null } {
  const requestedQty = params.requestedQty ?? 1;
  if (params.limit < 0) {
    return {
      allowed: true,
      limit: null,
      used: params.used,
      remaining: null,
    };
  }

  const remaining = Math.max(0, params.limit - params.used);
  return {
    allowed: params.used + requestedQty <= params.limit,
    limit: params.limit,
    used: params.used,
    remaining,
  };
}

export async function getGraphicNovelUsageForPeriod(params: {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<number> {
  return Math.max(
    0,
    await getUsageForPeriod(
      params.userId,
      params.periodStart,
      params.periodEnd,
      GRAPHIC_NOVEL_USAGE_EVENT
    )
  );
}

export async function assertGraphicNovelQuotaAvailable(userId: string): Promise<void> {
  const features = await getPlanFeatures(userId);
  const limit = features.graphicNovelsPerMonth;
  if (limit < 0) {
    return;
  }

  const subscription = await getPlanRepository().findSubscriptionByUserId(userId);
  const now = new Date();
  const period = subscription
    ? resolveActiveSubscriptionPeriod(subscription)
    : {
        periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };

  const used = await getGraphicNovelUsageForPeriod({
    userId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });
  const quota = calculateGraphicNovelQuota({ limit, used });

  if (!quota.allowed) {
    throw new GraphicNovelQuotaError(
      `Graphic novel limit reached (${used}/${limit}) for this billing period.`,
      { used, limit }
    );
  }
}

export async function releaseGraphicNovelQuotaReservationForRequest(
  requestId: string,
  options: {
    reason: QuotaReservationReleaseReason;
    errorMessage?: string;
  }
): Promise<{ released: boolean; netReserved: number; userId: string | null }> {
  return getStoryRepository().transaction(async (tx) => {
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
      return { released: false, netReserved: 0, userId: null };
    }

    const [reservationRow] = await tx
      .select({
        netReserved: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, request.userId),
          eq(schema.usageEvents.eventType, GRAPHIC_NOVEL_USAGE_EVENT),
          sql`(${schema.usageEvents.metadata}->>'requestId') = ${requestId}`,
          sql`(${schema.usageEvents.metadata}->>'quotaReservation') = 'true'`
        )
      );

    const netReserved = Number(reservationRow?.netReserved ?? 0);
    const releaseQuantity = getQuotaReservationReleaseQuantity(netReserved);
    if (releaseQuantity === 0) {
      return { released: false, netReserved, userId: request.userId };
    }

    const errorMessage = truncateQuotaReleaseErrorMessage(options.errorMessage);
    await tx.insert(schema.usageEvents).values({
      userId: request.userId,
      childProfileId: request.childProfileId ?? null,
      eventType: GRAPHIC_NOVEL_USAGE_EVENT,
      resourceType: 'graphic_novel',
      quantity: releaseQuantity,
      metadata: {
        requestId,
        ...(request.storyId && { storyId: request.storyId }),
        quotaReservation: true,
        quotaReservationRelease: true,
        releaseReason: options.reason,
        releasedAt: new Date().toISOString(),
        reservationBehavior: 'released_on_downstream_failure',
        originalRequestStatus: request.status,
        ...(errorMessage && { errorMessage }),
      },
    });

    return { released: true, netReserved, userId: request.userId };
  });
}
