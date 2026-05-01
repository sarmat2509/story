import type Stripe from 'stripe';
import config from '../config';
import { getBundleRepository, getPlanRepository } from '../repositories';
import { logger } from '../utils/logger';

export const BUNDLE_CHECKOUT_METADATA_KIND = 'bundle';

/** Whether [aStart,aEnd) intersects [bStart,bEnd) (half-open interval overlap). */
export function subscriptionPeriodsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function bundlePriceConfigKey(bundleSlug: string, planSlug: string): string {
  return `${bundleSlug}:${planSlug}`;
}

/**
 * Stripe Price ID for a bundle on a plan: DB `plan_bundle_prices.stripe_price_id` wins, else env map.
 */
export function resolveBundleStripePriceId(
  bundleSlug: string,
  planSlug: string,
  dbStripePriceId: string | null | undefined
): string | null {
  if (dbStripePriceId && dbStripePriceId.trim()) {
    return dbStripePriceId.trim();
  }
  const key = bundlePriceConfigKey(bundleSlug, planSlug);
  return config.stripe.bundlePriceIds[key] ?? null;
}

export async function getBundleBonusForPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ extraStories: number; extraAudio: number }> {
  return getBundleRepository().sumGrantBonusForPeriod(userId, periodStart, periodEnd);
}

export interface BundleListItem {
  slug: string;
  name: string;
  extraStories: number;
  extraAudio: number;
  sortOrder: number;
  priceMinor: number;
  pricingCurrency: string;
  stripePriceConfigured: boolean;
}

export async function listBundlesForUser(userId: string): Promise<BundleListItem[]> {
  const planRepo = getPlanRepository();
  const sub = await planRepo.findSubscriptionByUserId(userId);
  if (!sub) {
    return [];
  }
  const plan = await planRepo.findPlanById(sub.planId);
  if (!plan) {
    return [];
  }

  const rows = await getBundleRepository().listBundlesWithPricesForPlan(sub.planId);
  return rows.map(({ bundle, price }) => ({
    slug: bundle.slug,
    name: bundle.name,
    extraStories: bundle.extraStories,
    extraAudio: bundle.extraAudio,
    sortOrder: bundle.sortOrder,
    priceMinor: price.priceMinor,
    pricingCurrency: price.pricingCurrency,
    stripePriceConfigured: !!resolveBundleStripePriceId(
      bundle.slug,
      plan.slug,
      price.stripePriceId ?? null
    ),
  }));
}

/**
 * Idempotent: if grant already exists for session id, no-op.
 */
export async function applyPaidBundleFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.mode !== 'payment') {
    return;
  }
  if (session.metadata?.checkoutKind !== BUNDLE_CHECKOUT_METADATA_KIND) {
    return;
  }
  if (session.payment_status !== 'paid') {
    logger.warn({ sessionId: session.id }, 'Bundle checkout session not paid; skipping grant');
    return;
  }

  const userId = session.metadata.userId;
  const bundleSlug = session.metadata.bundleSlug;
  const extraStoriesRaw = session.metadata.extraStories;
  const extraAudioRaw = session.metadata.extraAudio;
  const periodStartRaw = session.metadata.subscriptionPeriodStart;
  const periodEndRaw = session.metadata.subscriptionPeriodEnd;

  if (!userId || !bundleSlug || extraStoriesRaw == null || extraAudioRaw == null) {
    logger.warn({ sessionId: session.id }, 'Bundle checkout session missing metadata');
    return;
  }

  const extraStories = parseInt(String(extraStoriesRaw), 10);
  const extraAudio = parseInt(String(extraAudioRaw), 10);
  if (!Number.isFinite(extraStories) || !Number.isFinite(extraAudio)) {
    logger.warn({ sessionId: session.id }, 'Bundle checkout invalid extra quotas in metadata');
    return;
  }

  const bundleRepo = getBundleRepository();
  const existing = await bundleRepo.findGrantByStripeSessionId(session.id);
  if (existing) {
    logger.debug({ sessionId: session.id }, 'Bundle grant already recorded');
    return;
  }

  const bundle = await bundleRepo.findBundleBySlug(bundleSlug);
  if (!bundle) {
    logger.error(
      { bundleSlug, sessionId: session.id },
      'Bundle slug from Stripe metadata not found'
    );
    return;
  }

  const periodStart = periodStartRaw ? new Date(String(periodStartRaw)) : null;
  const periodEnd = periodEndRaw ? new Date(String(periodEndRaw)) : null;
  if (
    !periodStart ||
    !periodEnd ||
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime())
  ) {
    logger.error({ sessionId: session.id }, 'Bundle checkout missing or invalid period bounds');
    return;
  }

  await bundleRepo.insertGrant({
    userId,
    bundleId: bundle.id,
    subscriptionPeriodStart: periodStart,
    subscriptionPeriodEnd: periodEnd,
    extraStories,
    extraAudio,
    source: 'stripe',
    stripeCheckoutSessionId: session.id,
  });

  logger.info(
    { userId, bundleSlug, sessionId: session.id, extraStories, extraAudio },
    'Recorded user_bundle_grant from Stripe bundle checkout'
  );
}
