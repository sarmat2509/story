/**
 * M1 Payment Integration: Stripe billing service
 * Handles Checkout Session, Customer Portal, and Webhook events.
 */

import Stripe from 'stripe';
import config from '../config';
import { getUserRepository } from '../repositories';
import { getPlanRepository } from '../repositories';
import * as planService from './planService';
import { logger } from '../utils/logger';

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

/**
 * Create Stripe Checkout Session for subscription (recurring).
 * Returns URL to redirect user to Stripe Checkout.
 */
export async function createCheckoutSession(
  userId: string,
  planSlug: string,
  email: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  const priceId = config.stripe.priceIds[planSlug];
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan: ${planSlug}`);
  }

  const customerId = await getOrCreateStripeCustomer(userId, email);
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
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
    },
    subscription_data: {
      metadata: {
        userId,
        planSlug,
      },
    },
  });

  if (!session.url) {
    throw new Error('Stripe Checkout Session URL not returned');
  }

  logger.info({ userId, planSlug, sessionId: session.id }, 'Created Stripe Checkout Session');
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
function getPlanSlugFromPriceId(priceId: string): string | null {
  for (const [slug, id] of Object.entries(config.stripe.priceIds)) {
    if (id === priceId) return slug;
  }
  return null;
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
      const userId = session.metadata?.userId;
      const planSlug = session.metadata?.planSlug;
      const subscriptionId = session.subscription as string;

      if (!userId || !planSlug || !subscriptionId) {
        logger.warn({ sessionId: session.id }, 'Checkout session missing metadata or subscription');
        return;
      }

      const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
      await planService.updateSubscriptionFromStripe(userId, {
        id: stripeSub.id,
        current_period_start: stripeSub.current_period_start,
        current_period_end: stripeSub.current_period_end,
        cancel_at_period_end: stripeSub.cancel_at_period_end,
        status: stripeSub.status,
      }, planSlug);
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const priceId = stripeSub.items.data[0]?.price?.id;
      const planSlug = stripeSub.metadata?.planSlug ?? (priceId ? getPlanSlugFromPriceId(priceId) : null);

      if (!planSlug) {
        logger.warn({ subscriptionId: stripeSub.id }, 'Could not resolve plan from subscription');
        return;
      }

      const planRepo = getPlanRepository();
      const existing = await planRepo.findSubscriptionByStripeSubscriptionId(stripeSub.id);
      const userId = existing?.userId ?? stripeSub.metadata?.userId;

      if (!userId) {
        logger.warn({ subscriptionId: stripeSub.id }, 'Could not find user for subscription update');
        return;
      }

      await planService.updateSubscriptionFromStripe(userId, {
        id: stripeSub.id,
        current_period_start: stripeSub.current_period_start,
        current_period_end: stripeSub.current_period_end,
        cancel_at_period_end: stripeSub.cancel_at_period_end,
        status: stripeSub.status,
      }, planSlug);
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      await planService.updateSubscriptionDeletedFromStripe(stripeSub.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      logger.warn({ invoiceId: invoice.id, subscriptionId: invoice.subscription }, 'Stripe invoice payment failed');
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe webhook event type');
  }
}
