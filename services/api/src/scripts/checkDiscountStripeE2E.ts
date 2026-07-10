/**
 * End-to-end verification of app discount codes against Stripe test mode.
 *
 * The check reuses two configured recurring Stripe Prices. It creates temporary
 * local users and discount codes plus Stripe Coupons, Customer, and Checkout
 * Sessions. Everything created by this script is removed in `finally`.
 *
 * Run inside the development API container so DATABASE_URL and STRIPE_SECRET_KEY
 * are available:
 *   pnpm api:script pnpm test:e2e:discount-stripe
 */

import crypto from 'crypto';
import Stripe from 'stripe';
import { and, asc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import config from '../config';
import db, { closeDatabaseConnection } from '../db';
import { discountApplications, discountCodes, planPrices, plans, users } from '../db/schema';
import {
  createAdminDiscountCode,
  DiscountCodeError,
  previewDiscount,
} from '../services/discountService';
import { createCheckoutSession } from '../services/billingService';

type PlanTarget = {
  planId: string;
  planSlug: string;
  planName: string;
  pricingCurrency: string;
  priceMonthly: number;
  stripePriceId: string;
};

type CreatedResources = {
  adminUserId: string;
  customerUserId: string;
  discountCodeIds: Set<string>;
  stripeCouponIds: Set<string>;
  stripeCustomerIds: Set<string>;
  stripeCheckoutSessionIds: Set<string>;
  localPlanIds: Set<string>;
  startedAtUnix: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingStripeResource(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'resource_missing';
}

async function isUsableMonthlyStripePrice(stripe: Stripe, target: PlanTarget): Promise<boolean> {
  try {
    const stripePrice = await stripe.prices.retrieve(target.stripePriceId);
    assert(stripePrice.active, `Stripe Price ${target.stripePriceId} is inactive`);
    assert(
      stripePrice.type === 'recurring',
      `Stripe Price ${target.stripePriceId} is not recurring`
    );
    assert(
      stripePrice.recurring?.interval === 'month',
      `Stripe Price ${target.stripePriceId} is not monthly`
    );
    assert(
      stripePrice.currency.toUpperCase() === target.pricingCurrency,
      `Currency mismatch for ${target.planSlug}: DB=${target.pricingCurrency}, Stripe=${stripePrice.currency}`
    );
    assert(
      stripePrice.unit_amount === target.priceMonthly,
      `Amount mismatch for ${target.planSlug}: DB=${target.priceMonthly}, Stripe=${stripePrice.unit_amount}`
    );
    return true;
  } catch (error) {
    if (isMissingStripeResource(error)) return false;
    throw error;
  }
}

async function createLocalPlansForExistingTestPrices(
  stripe: Stripe,
  resources: CreatedResources
): Promise<[PlanTarget, PlanTarget]> {
  const listed = await stripe.prices.list({ active: true, type: 'recurring', limit: 100 });
  const byCurrency = new Map<string, Stripe.Price[]>();
  for (const price of listed.data) {
    const currency = price.currency.toUpperCase();
    if (
      price.recurring?.interval !== 'month' ||
      !price.unit_amount ||
      !['EUR', 'USD'].includes(currency)
    ) {
      continue;
    }
    const pricesForCurrency = byCurrency.get(currency) ?? [];
    pricesForCurrency.push(price);
    byCurrency.set(currency, pricesForCurrency);
  }

  const pair = [...byCurrency.entries()].find(
    ([, pricesForCurrency]) => pricesForCurrency.length >= 2
  );
  assert(pair, 'Stripe test mode needs at least two existing active monthly Prices in EUR or USD');

  const [pricingCurrency, stripePrices] = pair;
  const suffix = crypto.randomBytes(6).toString('hex');
  const targets = stripePrices.slice(0, 2).map<PlanTarget>((stripePrice, index) => {
    const planId = crypto.randomUUID();
    resources.localPlanIds.add(planId);
    return {
      planId,
      planSlug: `discount-e2e-${suffix}-${index + 1}`,
      planName: `Discount E2E Plan ${index + 1}`,
      pricingCurrency,
      priceMonthly: stripePrice.unit_amount!,
      stripePriceId: stripePrice.id,
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(plans).values(
      targets.map((target, index) => ({
        id: target.planId,
        slug: target.planSlug,
        name: target.planName,
        priceMonthly: target.priceMonthly,
        pricingCurrency: target.pricingCurrency,
        billingPeriod: 'monthly',
        isActive: true,
        sortOrder: 10_000 + index,
        metadata: { e2e: 'discount-stripe' },
      }))
    );
    await tx.insert(planPrices).values(
      targets.map((target) => ({
        planId: target.planId,
        pricingCurrency: target.pricingCurrency,
        priceMonthly: target.priceMonthly,
        stripePriceId: target.stripePriceId,
      }))
    );
  });

  return targets as [PlanTarget, PlanTarget];
}

async function selectTwoConfiguredPlans(
  stripe: Stripe,
  resources: CreatedResources
): Promise<[PlanTarget, PlanTarget]> {
  const rows = await db
    .select({
      planId: plans.id,
      planSlug: plans.slug,
      planName: plans.name,
      pricingCurrency: planPrices.pricingCurrency,
      priceMonthly: planPrices.priceMonthly,
      stripePriceId: planPrices.stripePriceId,
    })
    .from(planPrices)
    .innerJoin(plans, eq(planPrices.planId, plans.id))
    .where(
      and(
        eq(plans.isActive, true),
        gt(planPrices.priceMonthly, 0),
        isNotNull(planPrices.stripePriceId)
      )
    )
    .orderBy(asc(planPrices.pricingCurrency), asc(plans.sortOrder));

  const byCurrency = new Map<string, PlanTarget[]>();
  for (const row of rows) {
    if (!row.stripePriceId) continue;
    const targets = byCurrency.get(row.pricingCurrency) ?? [];
    if (!targets.some((target) => target.planId === row.planId)) {
      targets.push({ ...row, stripePriceId: row.stripePriceId });
      byCurrency.set(row.pricingCurrency, targets);
    }
  }

  for (const targets of byCurrency.values()) {
    const usable: PlanTarget[] = [];
    for (const target of targets) {
      if (await isUsableMonthlyStripePrice(stripe, target)) usable.push(target);
      if (usable.length === 2) return usable as [PlanTarget, PlanTarget];
    }
  }

  return createLocalPlansForExistingTestPrices(stripe, resources);
}

async function verifyCheckoutAmount(params: {
  stripe: Stripe;
  resources: CreatedResources;
  userId: string;
  userEmail: string;
  target: PlanTarget;
  code: string;
  expectedPercentOff: number;
  expectedDurationMonths: number | null;
}): Promise<void> {
  const preview = await previewDiscount({
    userId: params.userId,
    code: params.code,
    kind: 'subscription',
    planSlug: params.target.planSlug,
    requestedBillingCurrency: params.target.pricingCurrency,
  });

  assert(preview.percentOff === params.expectedPercentOff, 'Preview returned the wrong percentage');
  assert(
    preview.durationMonths === params.expectedDurationMonths,
    'Preview returned the wrong duration'
  );
  assert(preview.originalAmountMinor === params.target.priceMonthly, 'Preview subtotal is wrong');

  const checkout = await createCheckoutSession(
    params.userId,
    params.target.planSlug,
    params.userEmail,
    'https://example.test/billing/success',
    'https://example.test/billing/cancel',
    params.target.pricingCurrency,
    params.code,
    preview.quoteFingerprint
  );
  params.resources.stripeCheckoutSessionIds.add(checkout.sessionId);

  const session = await params.stripe.checkout.sessions.retrieve(checkout.sessionId);
  const customerId =
    typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  assert(customerId, `Checkout Session ${session.id} has no Stripe Customer`);
  params.resources.stripeCustomerIds.add(customerId);

  assert(session.mode === 'subscription', 'Checkout Session is not in subscription mode');
  assert(
    session.status === 'open',
    'Checkout Session must remain open during this non-payment test'
  );
  assert(
    session.amount_subtotal === preview.originalAmountMinor,
    `Stripe subtotal mismatch: expected ${preview.originalAmountMinor}, got ${session.amount_subtotal}`
  );
  assert(
    session.total_details?.amount_discount === preview.discountAmountMinor,
    `Stripe discount mismatch: expected ${preview.discountAmountMinor}, got ${session.total_details?.amount_discount}`
  );
  assert(
    session.amount_total === preview.finalAmountMinor,
    `Stripe total mismatch: expected ${preview.finalAmountMinor}, got ${session.amount_total}`
  );
  assert(session.metadata?.userId === params.userId, 'Checkout Session belongs to the wrong user');
  assert(
    typeof session.metadata?.discountApplicationId === 'string',
    'Checkout Session is missing discount application metadata'
  );

  console.log(
    `✓ ${params.target.planSlug}: ${preview.originalAmountMinor} ${preview.pricingCurrency} minor units - ` +
      `${preview.percentOff}% = ${preview.finalAmountMinor}`
  );
}

async function discoverCreatedStripeResources(
  stripe: Stripe,
  resources: CreatedResources
): Promise<void> {
  const localCodes = await db
    .select({ id: discountCodes.id, stripeCouponId: discountCodes.stripeCouponId })
    .from(discountCodes)
    .where(eq(discountCodes.createdByUserId, resources.adminUserId));
  for (const code of localCodes) {
    resources.discountCodeIds.add(code.id);
    if (code.stripeCouponId) resources.stripeCouponIds.add(code.stripeCouponId);
  }

  const applications = resources.discountCodeIds.size
    ? await db
        .select({ checkoutSessionId: discountApplications.checkoutSessionId })
        .from(discountApplications)
        .where(inArray(discountApplications.discountCodeId, [...resources.discountCodeIds]))
    : [];
  for (const application of applications) {
    if (application.checkoutSessionId) {
      resources.stripeCheckoutSessionIds.add(application.checkoutSessionId);
    }
  }

  const recentSessions = await stripe.checkout.sessions.list({
    created: { gte: resources.startedAtUnix - 5 },
    limit: 100,
  });
  for (const session of recentSessions.data) {
    if (session.metadata?.userId === resources.customerUserId) {
      resources.stripeCheckoutSessionIds.add(session.id);
      const customerId =
        typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
      if (customerId) resources.stripeCustomerIds.add(customerId);
    }
  }

  const recentCustomers = await stripe.customers.list({
    created: { gte: resources.startedAtUnix - 5 },
    limit: 100,
  });
  for (const customer of recentCustomers.data) {
    if (!customer.deleted && customer.metadata?.userId === resources.customerUserId) {
      resources.stripeCustomerIds.add(customer.id);
    }
  }

  const recentCoupons = await stripe.coupons.list({ limit: 100 });
  for (const coupon of recentCoupons.data) {
    if (
      coupon.metadata?.discountCodeId &&
      resources.discountCodeIds.has(coupon.metadata.discountCodeId)
    ) {
      resources.stripeCouponIds.add(coupon.id);
    }
  }
}

async function cleanupStripe(stripe: Stripe, resources: CreatedResources): Promise<void> {
  const errors: string[] = [];

  for (const sessionId of resources.stripeCheckoutSessionIds) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === 'open') await stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      if (!isMissingStripeResource(error)) {
        errors.push(`session ${sessionId}: ${errorMessage(error)}`);
      }
    }
  }

  for (const couponId of resources.stripeCouponIds) {
    try {
      await stripe.coupons.del(couponId);
    } catch (error) {
      if (!isMissingStripeResource(error)) {
        errors.push(`coupon ${couponId}: ${errorMessage(error)}`);
      }
    }
  }

  for (const customerId of resources.stripeCustomerIds) {
    try {
      await stripe.customers.del(customerId);
    } catch (error) {
      if (!isMissingStripeResource(error)) {
        errors.push(`customer ${customerId}: ${errorMessage(error)}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Stripe cleanup failed:\n${errors.join('\n')}`);
  }
}

async function cleanupDatabase(resources: CreatedResources): Promise<void> {
  const localCodes = await db
    .select({ id: discountCodes.id })
    .from(discountCodes)
    .where(eq(discountCodes.createdByUserId, resources.adminUserId));
  for (const code of localCodes) resources.discountCodeIds.add(code.id);

  if (resources.discountCodeIds.size > 0) {
    const codeIds = [...resources.discountCodeIds];
    await db
      .delete(discountApplications)
      .where(inArray(discountApplications.discountCodeId, codeIds));
    await db.delete(discountCodes).where(inArray(discountCodes.id, codeIds));
  }

  await db
    .delete(users)
    .where(inArray(users.id, [resources.customerUserId, resources.adminUserId]));

  if (resources.localPlanIds.size > 0) {
    await db.delete(plans).where(inArray(plans.id, [...resources.localPlanIds]));
  }
}

async function runCheck(stripe: Stripe, resources: CreatedResources): Promise<void> {
  const [finitePlan, foreverPlan] = await selectTwoConfiguredPlans(stripe, resources);
  const suffix = crypto.randomBytes(8).toString('hex');
  const adminEmail = `discount-e2e-admin+${suffix}@example.test`;
  const customerEmail = `discount-e2e-user+${suffix}@example.test`;

  await db.insert(users).values([
    {
      id: resources.adminUserId,
      email: adminEmail,
      displayName: 'Discount E2E Admin',
      role: 'admin',
      preferredLocale: 'en',
      preferredBillingCurrency: finitePlan.pricingCurrency,
    },
    {
      id: resources.customerUserId,
      email: customerEmail,
      displayName: 'Discount E2E Customer',
      preferredLocale: 'en',
      preferredBillingCurrency: finitePlan.pricingCurrency,
    },
  ]);

  const finiteCode = await createAdminDiscountCode(
    {
      kind: 'subscription',
      percentOff: 20,
      durationMonths: 3,
      planId: finitePlan.planId,
      assignedUserEmails: [],
    },
    resources.adminUserId
  );
  assert(finiteCode, 'Admin service did not return the finite discount code');
  resources.discountCodeIds.add(finiteCode.id);

  const foreverCode = await createAdminDiscountCode(
    {
      kind: 'subscription',
      percentOff: 35,
      durationMonths: null,
      planId: foreverPlan.planId,
      assignedUserEmails: [],
    },
    resources.adminUserId
  );
  assert(foreverCode, 'Admin service did not return the forever discount code');
  resources.discountCodeIds.add(foreverCode.id);

  assert(/^WT-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(finiteCode.code), 'Finite code is not random');
  assert(/^WT-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(foreverCode.code), 'Forever code is not random');
  assert(finiteCode.planId === finitePlan.planId, 'Finite code has the wrong plan scope');
  assert(foreverCode.planId === foreverPlan.planId, 'Forever code has the wrong plan scope');

  let scopeMismatchVerified = false;
  try {
    await previewDiscount({
      userId: resources.customerUserId,
      code: finiteCode.code,
      kind: 'subscription',
      planSlug: foreverPlan.planSlug,
      requestedBillingCurrency: foreverPlan.pricingCurrency,
    });
  } catch (error) {
    scopeMismatchVerified =
      error instanceof DiscountCodeError && error.code === 'CODE_SCOPE_MISMATCH';
  }
  assert(scopeMismatchVerified, 'A plan-specific code was accepted for another plan');

  await verifyCheckoutAmount({
    stripe,
    resources,
    userId: resources.customerUserId,
    userEmail: customerEmail,
    target: finitePlan,
    code: finiteCode.code,
    expectedPercentOff: 20,
    expectedDurationMonths: 3,
  });
  await verifyCheckoutAmount({
    stripe,
    resources,
    userId: resources.customerUserId,
    userEmail: customerEmail,
    target: foreverPlan,
    code: foreverCode.code,
    expectedPercentOff: 35,
    expectedDurationMonths: null,
  });

  const persistedCodes = await db
    .select()
    .from(discountCodes)
    .where(inArray(discountCodes.id, [finiteCode.id, foreverCode.id]));
  assert(
    persistedCodes.length === 2,
    'Both discount codes must remain present during verification'
  );

  for (const code of persistedCodes) {
    assert(code.stripeCouponId, `Discount code ${code.code} has no Stripe Coupon`);
    resources.stripeCouponIds.add(code.stripeCouponId);
    const coupon = await stripe.coupons.retrieve(code.stripeCouponId);
    assert(
      coupon.percent_off === code.percentOff,
      `Stripe Coupon ${coupon.id} has wrong percent_off`
    );
    if (code.id === finiteCode.id) {
      assert(coupon.duration === 'repeating', 'Finite coupon is not repeating');
      assert(coupon.duration_in_months === 3, 'Finite coupon does not last three months');
    } else {
      assert(coupon.duration === 'forever', 'Unlimited coupon is not forever');
    }
  }
}

async function main(): Promise<void> {
  if (!config.stripe.secretKey.startsWith('sk_test_')) {
    throw new Error('Refusing to run: STRIPE_SECRET_KEY must be an sk_test_ key');
  }

  const stripe = new Stripe(config.stripe.secretKey);
  const resources: CreatedResources = {
    adminUserId: crypto.randomUUID(),
    customerUserId: crypto.randomUUID(),
    discountCodeIds: new Set(),
    stripeCouponIds: new Set(),
    stripeCustomerIds: new Set(),
    stripeCheckoutSessionIds: new Set(),
    localPlanIds: new Set(),
    startedAtUnix: Math.floor(Date.now() / 1000),
  };

  let checkError: unknown;
  let cleanupError: unknown;
  try {
    await runCheck(stripe, resources);
  } catch (error) {
    checkError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await discoverCreatedStripeResources(stripe, resources);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await cleanupStripe(stripe, resources);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await cleanupDatabase(resources);
      console.log(
        '✓ Expired temporary Checkout Sessions and removed test Coupons, Customer, and database records'
      );
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      await closeDatabaseConnection();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      cleanupError = new AggregateError(cleanupErrors, 'E2E cleanup failed');
    }
  }

  if (checkError && cleanupError) {
    throw new AggregateError([checkError, cleanupError], 'E2E check and cleanup both failed');
  }
  if (cleanupError) throw cleanupError;
  if (checkError) throw checkError;

  console.log('✓ Discount Stripe E2E check passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
