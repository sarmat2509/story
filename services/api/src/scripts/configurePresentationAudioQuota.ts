/**
 * Add the exact period-scoped audio allowance needed by the presentation catalog.
 * Uses the existing user_bundle_grants entitlement contract without a payment.
 *
 * Dry run:
 *   pnpm configure:presentation-audio-quota -- --user-id=<uuid>
 * Execute:
 *   pnpm configure:presentation-audio-quota -- --user-id=<uuid> --execute
 */

import './loadEnvForScripts';

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import {
  features,
  plans,
  planFeatures,
  storyBundles,
  usageEvents,
  userBundleGrants,
  users,
  userSubscriptions,
} from '../db/schema';
import { PRESENTATION_AUDIO_PERIOD } from './presentationAudioManifest';

const EXECUTE = process.argv.includes('--execute');
const userId =
  process.argv.find((arg) => arg.startsWith('--user-id='))?.slice('--user-id='.length).trim() ||
  process.env.PRESENTATION_USER_ID?.trim();

const EXPECTED_BASE_LIMIT = 10;
const EXTRA_AUDIO = 11;
const GRANT_SOURCE = 'presentation_audio';
const REFERENCE_BUNDLE_SLUG = 'bundle_large';

function numericLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'limit' in value) {
    const limit = (value as { limit?: unknown }).limit;
    return typeof limit === 'number' && Number.isFinite(limit) ? limit : null;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function main(): Promise<void> {
  if (!userId) throw new Error('Pass --user-id=<uuid> or set PRESENTATION_USER_ID');

  const periodStart = new Date(PRESENTATION_AUDIO_PERIOD.start);
  const periodEnd = new Date(PRESENTATION_AUDIO_PERIOD.end);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`presentation_audio_quota:${userId}:${PRESENTATION_AUDIO_PERIOD.start}`})::bigint)`
    );

    const [target] = await tx
      .select({
        id: users.id,
        displayName: users.displayName,
        userStatus: users.status,
        subscriptionStatus: userSubscriptions.status,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        metadata: userSubscriptions.metadata,
        planId: plans.id,
        planSlug: plans.slug,
      })
      .from(users)
      .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .innerJoin(plans, eq(plans.id, userSubscriptions.planId))
      .where(eq(users.id, userId))
      .limit(1);

    const metadata = asObject(target?.metadata);
    if (
      !target ||
      target.userStatus !== 'active' ||
      target.subscriptionStatus !== 'active' ||
      target.displayName !== 'QA Free User' ||
      target.planSlug !== 'golden' ||
      metadata.source !== 'seedQaTestAccounts' ||
      metadata.code !== 'FREE_USER'
    ) {
      throw new Error('Refusing quota grant: target is not the guarded QA presentation account');
    }

    if (
      target.currentPeriodStart.getTime() !== periodStart.getTime() ||
      target.currentPeriodEnd.getTime() !== periodEnd.getTime()
    ) {
      throw new Error('Refusing quota grant: active subscription period is not the pinned period');
    }

    const [feature] = await tx
      .select({ value: planFeatures.value })
      .from(planFeatures)
      .innerJoin(features, eq(features.id, planFeatures.featureId))
      .where(
        and(
          eq(planFeatures.planId, target.planId),
          eq(features.slug, 'audio_stories_per_month')
        )
      )
      .limit(1);
    const baseLimit = numericLimit(feature?.value);
    if (baseLimit !== EXPECTED_BASE_LIMIT) {
      throw new Error(`Unexpected Golden audio limit: ${baseLimit}`);
    }

    const [bundle] = await tx
      .select()
      .from(storyBundles)
      .where(and(eq(storyBundles.slug, REFERENCE_BUNDLE_SLUG), eq(storyBundles.isActive, true)))
      .limit(1);
    if (!bundle) throw new Error(`Reference bundle ${REFERENCE_BUNDLE_SLUG} is missing`);

    const existing = await tx
      .select()
      .from(userBundleGrants)
      .where(
        and(
          eq(userBundleGrants.userId, userId),
          eq(userBundleGrants.source, GRANT_SOURCE),
          eq(userBundleGrants.subscriptionPeriodStart, periodStart),
          eq(userBundleGrants.subscriptionPeriodEnd, periodEnd)
        )
      );
    if (existing.length > 1) throw new Error('Multiple presentation audio grants found');
    if (
      existing[0] &&
      (existing[0].bundleId !== bundle.id ||
        existing[0].extraStories !== 0 ||
        existing[0].extraAudio !== EXTRA_AUDIO ||
        existing[0].stripeCheckoutSessionId !== null)
    ) {
      throw new Error('Existing presentation audio grant does not match the guarded contract');
    }

    const [usage] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${usageEvents.quantity}), 0)::integer` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.eventType, 'audio_synthesized'),
          gte(usageEvents.createdAt, periodStart),
          lt(usageEvents.createdAt, periodEnd)
        )
      );
    const used = Number(usage?.total ?? 0);
    const changed = existing.length === 0;

    console.log(
      JSON.stringify(
        {
          mode: EXECUTE ? 'execute' : 'dry-run',
          changed,
          target: { id: target.id, displayName: target.displayName, plan: target.planSlug },
          period: PRESENTATION_AUDIO_PERIOD,
          audio: {
            used,
            baseLimit,
            grant: EXTRA_AUDIO,
            effectiveLimit: baseLimit + EXTRA_AUDIO,
            source: GRANT_SOURCE,
          },
        },
        null,
        2
      )
    );

    if (EXECUTE && changed) {
      await tx.insert(userBundleGrants).values({
        userId,
        bundleId: bundle.id,
        subscriptionPeriodStart: periodStart,
        subscriptionPeriodEnd: periodEnd,
        extraStories: 0,
        extraAudio: EXTRA_AUDIO,
        source: GRANT_SOURCE,
        stripeCheckoutSessionId: null,
      });
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
