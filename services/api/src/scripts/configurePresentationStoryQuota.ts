/**
 * Configure the guarded presentation account with period-scoped quota extensions.
 *
 * The normal Golden limits stay visible and enforceable until they are exhausted:
 * - story usage 0..19 => limit 20; usage 20+ => limit 21
 * - comic usage 0..4 => limit 5; usage 5+ => limit 7
 *
 * Dry run:
 *   pnpm configure:presentation-story-quota -- --user-id=<uuid>
 *
 * Execute:
 *   pnpm configure:presentation-story-quota -- --user-id=<uuid> --execute
 */

import './loadEnvForScripts';

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import {
  features,
  plans,
  planFeatures,
  usageEvents,
  users,
  userSubscriptions,
} from '../db/schema';
import {
  CONDITIONAL_QUOTA_EXTENSIONS_METADATA_KEY,
  getActivatedConditionalQuotaExtension,
} from '../services/conditionalQuotaExtensionService';
import { resolveActiveSubscriptionPeriod } from '../services/subscriptionPeriodService';

const EXECUTE = process.argv.includes('--execute');
const userId =
  process.argv
    .find((arg) => arg.startsWith('--user-id='))
    ?.slice('--user-id='.length)
    .trim() || process.env.PRESENTATION_USER_ID?.trim();

const EXPECTED_STORY_LIMIT = 20;
const EXPECTED_GRAPHIC_NOVEL_LIMIT = 5;
const EXTRA_STORIES = 1;
const EXTRA_GRAPHIC_NOVELS = 2;
const EXTENSION_REASON = 'presentation_catalog';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractNumericLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'limit' in value) {
    const limit = (value as { limit?: unknown }).limit;
    return typeof limit === 'number' && Number.isFinite(limit) ? limit : null;
  }
  return null;
}

async function usageForPeriod(params: {
  targetUserId: string;
  eventType: 'story_created' | 'graphic_novel_created';
  periodStart: Date;
  periodEnd: Date;
}): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageEvents.quantity}), 0)::integer` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, params.targetUserId),
        eq(usageEvents.eventType, params.eventType),
        gte(usageEvents.createdAt, params.periodStart),
        lt(usageEvents.createdAt, params.periodEnd)
      )
    );
  return Number(row?.total ?? 0);
}

async function main(): Promise<void> {
  if (!userId) {
    throw new Error('Pass --user-id=<uuid> or set PRESENTATION_USER_ID');
  }

  const [target] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      userStatus: users.status,
      subscriptionId: userSubscriptions.id,
      subscriptionStatus: userSubscriptions.status,
      paymentProvider: userSubscriptions.paymentProvider,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      resetAt: userSubscriptions.resetAt,
      metadata: userSubscriptions.metadata,
      planId: plans.id,
      planSlug: plans.slug,
    })
    .from(users)
    .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .innerJoin(plans, eq(plans.id, userSubscriptions.planId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!target || target.userStatus !== 'active' || target.subscriptionStatus !== 'active') {
    throw new Error('Target user or subscription does not exist or is not active');
  }

  const metadata = asObject(target.metadata);
  const isGuardedPresentationAccount =
    target.displayName === 'QA Free User' &&
    target.planSlug === 'golden' &&
    metadata.source === 'seedQaTestAccounts' &&
    metadata.code === 'FREE_USER';
  if (!isGuardedPresentationAccount) {
    throw new Error('Refusing to change quota: target is not the guarded QA presentation account');
  }

  const activePeriod = resolveActiveSubscriptionPeriod({
    currentPeriodStart: target.currentPeriodStart,
    currentPeriodEnd: target.currentPeriodEnd,
    resetAt: target.resetAt,
    paymentProvider: target.paymentProvider,
  });
  if (activePeriod.expiredStripePeriod || activePeriod.shouldReset) {
    throw new Error('Presentation subscription period is not current; refresh it before configuring quota');
  }

  const featureRows = await db
    .select({ slug: features.slug, value: planFeatures.value })
    .from(planFeatures)
    .innerJoin(features, eq(features.id, planFeatures.featureId))
    .where(eq(planFeatures.planId, target.planId));
  const featureLimits = new Map(
    featureRows.map((row) => [row.slug, extractNumericLimit(row.value)] as const)
  );
  const storyPlanLimit = featureLimits.get('stories_per_month');
  const graphicNovelPlanLimit = featureLimits.get('graphic_novels_per_month');
  if (
    storyPlanLimit !== EXPECTED_STORY_LIMIT ||
    graphicNovelPlanLimit !== EXPECTED_GRAPHIC_NOVEL_LIMIT
  ) {
    throw new Error(
      `Unexpected Golden limits: stories=${storyPlanLimit}, graphicNovels=${graphicNovelPlanLimit}`
    );
  }

  const periodStart = activePeriod.periodStart;
  const periodEnd = activePeriod.periodEnd;
  const existingExtensions = asObject(metadata[CONDITIONAL_QUOTA_EXTENSIONS_METADATA_KEY]);
  const configuredExtensions = {
    ...existingExtensions,
    stories_per_month: {
      extra: EXTRA_STORIES,
      activatesAtUsage: EXPECTED_STORY_LIMIT,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      reason: EXTENSION_REASON,
    },
    graphic_novels_per_month: {
      extra: EXTRA_GRAPHIC_NOVELS,
      activatesAtUsage: EXPECTED_GRAPHIC_NOVEL_LIMIT,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      reason: EXTENSION_REASON,
    },
  };
  const nextMetadata = {
    ...metadata,
    [CONDITIONAL_QUOTA_EXTENSIONS_METADATA_KEY]: configuredExtensions,
  };

  const [storiesUsed, graphicNovelsUsed] = await Promise.all([
    usageForPeriod({
      targetUserId: userId,
      eventType: 'story_created',
      periodStart,
      periodEnd,
    }),
    usageForPeriod({
      targetUserId: userId,
      eventType: 'graphic_novel_created',
      periodStart,
      periodEnd,
    }),
  ]);
  const storyExtensionNow = getActivatedConditionalQuotaExtension({
    metadata: nextMetadata,
    featureSlug: 'stories_per_month',
    currentUsage: storiesUsed,
    periodStart,
    periodEnd,
  });
  const graphicNovelExtensionNow = getActivatedConditionalQuotaExtension({
    metadata: nextMetadata,
    featureSlug: 'graphic_novels_per_month',
    currentUsage: graphicNovelsUsed,
    periodStart,
    periodEnd,
  });
  const changed =
    JSON.stringify(existingExtensions) !== JSON.stringify(configuredExtensions);

  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? 'execute' : 'dry-run',
        changed,
        target: { id: target.id, displayName: target.displayName, plan: target.planSlug },
        period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
        stories: {
          used: storiesUsed,
          normalLimit: EXPECTED_STORY_LIMIT,
          extensionNow: storyExtensionNow,
          effectiveLimitNow: EXPECTED_STORY_LIMIT + storyExtensionNow,
          effectiveLimitAfterThreshold: EXPECTED_STORY_LIMIT + EXTRA_STORIES,
        },
        graphicNovels: {
          used: graphicNovelsUsed,
          normalLimit: EXPECTED_GRAPHIC_NOVEL_LIMIT,
          extensionNow: graphicNovelExtensionNow,
          effectiveLimitNow: EXPECTED_GRAPHIC_NOVEL_LIMIT + graphicNovelExtensionNow,
          effectiveLimitAfterThreshold: EXPECTED_GRAPHIC_NOVEL_LIMIT + EXTRA_GRAPHIC_NOVELS,
        },
      },
      null,
      2
    )
  );

  if (!EXECUTE || !changed) return;

  await db
    .update(userSubscriptions)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, target.subscriptionId));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
