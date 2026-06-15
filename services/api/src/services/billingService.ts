/**
 * M1 Payment Integration: Stripe billing service
 * Handles Checkout Session, Customer Portal, and Webhook events.
 */

import Stripe from 'stripe';
import config from '../config';
import { getUserRepository, getPlanRepository, getBundleRepository } from '../repositories';
import * as planService from './planService';
import * as bundleService from './bundleService';
import { BUNDLE_CHECKOUT_METADATA_KIND } from './bundleService';
import { resolveActiveSubscriptionPeriod } from './subscriptionPeriodService';
import { logger } from '../utils/logger';
import {
  normalizeBillingCurrency,
} from './planPresentationService';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    if (!config.stripe.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeClient = new Stripe(config.stripe.secretKey);
  }
  return stripeClient;
}

/**
 * Get or create Stripe Customer for user.
 */
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) throw new Error('User not found');

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await userRepo.update(userId, { stripeCustomerId: customer.id });
  logger.info({ userId, customerId: customer.id }, 'Created Stripe customer');
  return customer.id;
}

export function isMissingStripeCustomerForActiveMode(error: unknown): boolean {
  const maybeStripeError = error as {
    code?: unknown;
    param?: unknown;
    message?: unknown;
  } | null;
  const message = typeof maybeStripeError?.message === 'string' ? maybeStripeError.message : '';

  return (
    maybeStripeError?.code === 'resource_missing' &&
    maybeStripeError?.param === 'customer' &&
    message.includes('No such customer')
  );
}

async function replaceStripeCustomerForActiveMode(
  userId: string,
  email: string,
  previousCustomerId: string
): Promise<string> {
  const stripe = getStripe();
  const userRepo = getUserRepository();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await userRepo.update(userId, { stripeCustomerId: customer.id });
  logger.warn(
    { userId, previousCustomerId, customerId: customer.id },
    'Replaced Stripe customer for active key mode'
  );
  return customer.id;
}

/**
 * Create Stripe Checkout Session for subscription (recurring).
 * Returns URL to redirect user to Stripe Checkout.
 */
export async function createCheckoutSession(
  userId: string,
  planSlug: string,
  email: string,
  successUrl: string,
  cancelUrl: string,
  requestedBillingCurrency?: string | null
): Promise<{ sessionId: string; url: string }> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  const billingCurrency = normalizeBillingCurrency(
    requestedBillingCurrency || user?.preferredBillingCurrency
  );
  const planRepo = getPlanRepository();
  const plan = await planRepo.findPlanBySlug(planSlug);
  if (!plan) {
    throw new Error(`Unknown plan: ${planSlug}`);
  }

  const planPrice = await planRepo.findPlanPrice(plan.id, billingCurrency);
  const priceId =
    planPrice?.stripePriceId ||
    config.stripe.priceIdsByCurrency[billingCurrency]?.[planSlug] ||
    (billingCurrency === 'USD' ? config.stripe.priceIds[planSlug] : undefined);
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan: ${planSlug} (${billingCurrency})`);
  }
  if (user?.preferredBillingCurrency !== billingCurrency) {
    await userRepo.update(userId, { preferredBillingCurrency: billingCurrency });
  }

  let customerId = await getOrCreateStripeCustomer(userId, email);
  const stripe = getStripe();

  const createSession = (customer: string) =>
    stripe.checkout.sessions.create({
      customer,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        planSlug,
        billingCurrency,
      },
      subscription_data: {
        metadata: {
          userId,
          planSlug,
          billingCurrency,
        },
      },
    });

  let session: Stripe.Checkout.Session;
  try {
    session = await createSession(customerId);
  } catch (error) {
    if (!isMissingStripeCustomerForActiveMode(error)) {
      throw error;
    }
    customerId = await replaceStripeCustomerForActiveMode(userId, email, customerId);
    session = await createSession(customerId);
  }

  if (!session.url) {
    throw new Error('Stripe Checkout Session URL not returned');
  }

  logger.info(
    { userId, planSlug, billingCurrency, sessionId: session.id },
    'Created Stripe Checkout Session'
  );
  return { sessionId: session.id, url: session.url };
}

/**
 * One-time Checkout for a story+audio bundle (extra limits until current period end).
 */
export async function createBundleCheckoutSession(
  userId: string,
  bundleSlug: string,
  email: string,
  successUrl: string,
  cancelUrl: string,
  requestedBillingCurrency?: string | null
): Promise<{ sessionId: string; url: string }> {
  const planRepo = getPlanRepository();
  const bundleRepo = getBundleRepository();
  const billingCurrency = normalizeBillingCurrency(requestedBillingCurrency);

  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription) {
    throw new Error('No subscription found');
  }

  const plan = await planRepo.findPlanById(subscription.planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  const bundle = await bundleRepo.findBundleBySlug(bundleSlug);
  if (!bundle || !bundle.isActive) {
    throw new Error(`Unknown or inactive bundle: ${bundleSlug}`);
  }

  const priceRow = await bundleRepo.findPriceForPlanAndBundle(plan.id, bundle.id, billingCurrency);
  if (!priceRow) {
    throw new Error(`No ${billingCurrency} bundle price for plan ${plan.slug} and bundle ${bundleSlug}`);
  }

  const stripePriceId = bundleService.resolveBundleStripePriceId(
    bundle.slug,
    plan.slug,
    priceRow.stripePriceId
  );

  let customerId = await getOrCreateStripeCustomer(userId, email);
  const stripe = getStripe();

  const period = resolveActiveSubscriptionPeriod(subscription);
  if (period.expiredStripePeriod) {
    throw new Error('Subscription billing period is expired; wait for Stripe status refresh before buying bundles.');
  }
  if (period.shouldReset && period.resetPatch) {
    await planRepo.updateSubscription(userId, period.resetPatch);
  }

  const periodStart = period.periodStart;
  const periodEnd = period.periodEnd;
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = stripePriceId
    ? { price: stripePriceId, quantity: 1 }
    : {
        price_data: {
          currency: priceRow.pricingCurrency.toLowerCase(),
          unit_amount: priceRow.priceMinor,
          product_data: {
            name: bundle.name,
            description: `${bundle.extraStories} extra stories and ${bundle.extraAudio} extra audio stories`,
            metadata: {
              bundleSlug: bundle.slug,
              planSlug: plan.slug,
            },
          },
        },
        quantity: 1,
      };

  const createSession = (customer: string) =>
    stripe.checkout.sessions.create({
      customer,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        checkoutKind: BUNDLE_CHECKOUT_METADATA_KIND,
        userId,
        bundleSlug: bundle.slug,
        planSlug: plan.slug,
        billingCurrency,
        extraStories: String(bundle.extraStories),
        extraAudio: String(bundle.extraAudio),
        subscriptionPeriodStart: periodStart.toISOString(),
        subscriptionPeriodEnd: periodEnd.toISOString(),
      },
    });

  let session: Stripe.Checkout.Session;
  try {
    session = await createSession(customerId);
  } catch (error) {
    if (!isMissingStripeCustomerForActiveMode(error)) {
      throw error;
    }
    customerId = await replaceStripeCustomerForActiveMode(userId, email, customerId);
    session = await createSession(customerId);
  }

  if (!session.url) {
    throw new Error('Stripe Checkout Session URL not returned');
  }

  logger.info(
    { userId, bundleSlug, sessionId: session.id },
    'Created Stripe bundle Checkout Session'
  );
  return { sessionId: session.id, url: session.url };
}

/**
 * Create Stripe Customer Portal session for managing subscription.
 */
export async function createPortalSession(userId: string, returnUrl: string): Promise<string> {
  const planRepo = getPlanRepository();
  const subscription = await planRepo.findSubscriptionByUserId(userId);
  if (!subscription?.stripeSubscriptionId) {
    throw new Error('No active Stripe subscription found');
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user?.stripeCustomerId) {
    throw new Error('No Stripe customer found');
  }

  const stripe = getStripe();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  logger.info({ userId }, 'Created Stripe Portal session');
  return portalSession.url;
}

/**
 * Resolve plan slug from Stripe Price ID (reverse lookup).
 */
async function getPlanSlugFromPriceId(priceId: string): Promise<string | null> {
  const planPrice = await getPlanRepository().findPlanPriceByStripePriceId(priceId);
  if (planPrice) {
    return planPrice.planSlug;
  }

  const priceMaps: Array<Record<string, string>> = [
    config.stripe.priceIds,
    config.stripe.priceIdsByCurrency.USD,
    config.stripe.priceIdsByCurrency.EUR,
  ];
  for (const priceMap of priceMaps) {
    for (const [slug, id] of Object.entries(priceMap)) {
      if (id === priceId) return slug;
    }
  }
  return null;
}

function getStripeObjectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

export function resolveStripeInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const invoiceWithParent = invoice as Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        subscription?: unknown;
      };
    } | null;
  };

  return (
    getStripeObjectId(invoice.subscription) ??
    getStripeObjectId(invoiceWithParent.parent?.subscription_details?.subscription) ??
    null
  );
}

/**
 * Handle Stripe webhook events.
 * Must be called with raw body (for signature verification).
 */
export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  if (!config.stripe.webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ err: message }, 'Stripe webhook signature verification failed');
    throw new Error(`Webhook signature verification failed: ${message}`);
  }

  logger.info({ eventId: event.id, type: event.type }, 'Processing Stripe webhook');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      if (
        session.mode === 'payment' &&
        session.metadata?.checkoutKind === BUNDLE_CHECKOUT_METADATA_KIND
      ) {
        await bundleService.applyPaidBundleFromCheckoutSession(session);
        break;
      }

      const userId = session.metadata?.userId;
      const planSlug = session.metadata?.planSlug;
      const subscriptionId = session.subscription as string | null;

      if (!userId || !planSlug || !subscriptionId) {
        logger.warn({ sessionId: session.id }, 'Checkout session missing metadata or subscription');
        return;
      }

      const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
      await planService.updateSubscriptionFromStripe(userId, stripeSub, planSlug);
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const priceId = stripeSub.items.data[0]?.price?.id;
      const planSlug =
        stripeSub.metadata?.planSlug ?? (priceId ? await getPlanSlugFromPriceId(priceId) : null);

      if (!planSlug) {
        logger.warn({ subscriptionId: stripeSub.id }, 'Could not resolve plan from subscription');
        return;
      }

      const planRepo = getPlanRepository();
      const existing = await planRepo.findSubscriptionByStripeSubscriptionId(stripeSub.id);
      const userId = existing?.userId ?? stripeSub.metadata?.userId;

      if (!userId) {
        logger.warn(
          { subscriptionId: stripeSub.id },
          'Could not find user for subscription update'
        );
        return;
      }

      await planService.updateSubscriptionFromStripe(userId, stripeSub, planSlug);
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      await planService.updateSubscriptionDeletedFromStripe(stripeSub.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = resolveStripeInvoiceSubscriptionId(invoice);
      logger.warn(
        { invoiceId: invoice.id, subscriptionId },
        'Stripe invoice payment failed'
      );
      if (subscriptionId) {
        await planService.markStripeSubscriptionPaymentFailed(subscriptionId);
      }
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe webhook event type');
  }
}

type RevenueCatWebhookPayload = {
  api_version?: string;
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    product_id?: string;
    entitlement_id?: string | null;
    entitlement_ids?: string[] | null;
    purchased_at_ms?: number | null;
    expiration_at_ms?: number | null;
  };
};

function getRevenueCatPlanSlug(event: NonNullable<RevenueCatWebhookPayload['event']>): string | null {
  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.filter((value): value is string => typeof value === 'string')
    : [];
  if (event.entitlement_id) {
    entitlementIds.push(event.entitlement_id);
  }

  for (const entitlementId of entitlementIds) {
    const planSlug = config.revenueCat.entitlementPlanMap[entitlementId];
    if (planSlug) return planSlug;
  }

  return event.product_id ? config.revenueCat.productPlanMap[event.product_id] ?? null : null;
}

export async function handleRevenueCatWebhook(rawBody: Buffer, authorizationHeader?: string): Promise<void> {
  if (!config.revenueCat.webhookAuthorization) {
    throw new Error('REVENUECAT_WEBHOOK_AUTHORIZATION is not configured');
  }

  if (authorizationHeader !== config.revenueCat.webhookAuthorization) {
    throw new Error('RevenueCat webhook authorization failed');
  }

  const payload = JSON.parse(rawBody.toString('utf8')) as RevenueCatWebhookPayload;
  const event = payload.event;
  if (!event?.type || !event.app_user_id) {
    throw new Error('RevenueCat webhook missing event type or app_user_id');
  }

  logger.info({
    eventId: event.id ?? null,
    type: event.type,
    userId: event.app_user_id,
    productId: event.product_id ?? null,
  }, 'Processing RevenueCat webhook');

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
    case 'NON_RENEWING_PURCHASE': {
      const planSlug = getRevenueCatPlanSlug(event);
      if (!planSlug) {
        logger.warn({
          eventId: event.id ?? null,
          productId: event.product_id ?? null,
          entitlementIds: event.entitlement_ids ?? null,
        }, 'Could not resolve plan from RevenueCat webhook');
        return;
      }
      await planService.updateSubscriptionFromRevenueCat({
        userId: event.app_user_id,
        planSlug,
        eventType: event.type,
        productId: event.product_id ?? null,
        purchasedAtMs: event.purchased_at_ms ?? null,
        expirationAtMs: event.expiration_at_ms ?? null,
      });
      break;
    }

    case 'CANCELLATION': {
      const planSlug = getRevenueCatPlanSlug(event);
      if (!planSlug) {
        logger.warn({ eventId: event.id ?? null }, 'RevenueCat cancellation missing plan mapping');
        return;
      }
      await planService.updateSubscriptionFromRevenueCat({
        userId: event.app_user_id,
        planSlug,
        eventType: event.type,
        productId: event.product_id ?? null,
        purchasedAtMs: event.purchased_at_ms ?? null,
        expirationAtMs: event.expiration_at_ms ?? null,
      });
      break;
    }

    case 'EXPIRATION': {
      await planService.expireSubscriptionFromRevenueCat(event.app_user_id);
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled RevenueCat webhook event type');
  }
}
