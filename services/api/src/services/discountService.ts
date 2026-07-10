import crypto from 'crypto';
import type Stripe from 'stripe';
import {
  getBundleRepository,
  getDiscountRepository,
  getPlanRepository,
  getUserRepository,
} from '../repositories';
import type { DiscountCode, DiscountApplication } from '../db/schema';
import { normalizeBillingCurrency } from './planPresentationService';
import { sendBillingRenewalReminderEmail, sendDiscountCodeAssignedEmail } from './emailService';
import { logger } from '../utils/logger';

export type DiscountKind = 'subscription' | 'bundle';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SEGMENT_LENGTH = 4;
const MAX_CODE_GENERATION_ATTEMPTS = 10;

export class DiscountCodeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = 'DiscountCodeError';
  }
}

export interface DiscountPreview {
  code: string;
  kind: DiscountKind;
  percentOff: number;
  durationMonths: number | null;
  originalAmountMinor: number;
  discountAmountMinor: number;
  finalAmountMinor: number;
  pricingCurrency: string;
  estimatedEndsAt: Date | null;
  planId: string | null;
  planSlug: string | null;
  planName: string | null;
  bundleId: string | null;
  bundleSlug: string | null;
  bundleName: string | null;
  discountCode: DiscountCode;
  quoteFingerprint: string;
}

export interface AdminDiscountCodeInput {
  kind: DiscountKind;
  percentOff: number;
  durationMonths?: number | null;
  planId?: string | null;
  bundleId?: string | null;
  isActive?: boolean;
  assignedUserEmails?: string[];
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function randomSegment(): string {
  const bytes = crypto.randomBytes(CODE_SEGMENT_LENGTH);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export function generateDiscountCodeValue(): string {
  return `WT-${randomSegment()}-${randomSegment()}`;
}

export function calculateDiscountedAmount(
  originalAmountMinor: number,
  percentOff: number
): {
  discountAmountMinor: number;
  finalAmountMinor: number;
} {
  const discountAmountMinor = Math.round((originalAmountMinor * percentOff) / 100);
  return {
    discountAmountMinor,
    finalAmountMinor: Math.max(0, originalAmountMinor - discountAmountMinor),
  };
}

export function addCalendarMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetFirst = new Date(
    Date.UTC(
      year,
      month + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
  const lastDay = new Date(
    Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)
  ).getUTCDate();
  targetFirst.setUTCDate(Math.min(day, lastDay));
  return targetFirst;
}

export function resolveRenewalReminderPricing(params: {
  regularAmountMinor: number;
  percentOff: number | null;
  discountEndsAt: Date | null;
  periodEnd: Date;
  now: Date;
  cutoff: Date;
}): { discountEnding: boolean; nextAmountMinor: number } {
  const discountEnding = !!(
    params.percentOff != null &&
    params.discountEndsAt &&
    params.discountEndsAt > params.now &&
    params.discountEndsAt <= params.cutoff &&
    Math.abs(params.discountEndsAt.getTime() - params.periodEnd.getTime()) <= 6 * 60 * 60 * 1000
  );
  const discountStillApplies = !!(
    params.percentOff != null &&
    (!params.discountEndsAt || params.discountEndsAt > params.periodEnd)
  );
  return {
    discountEnding,
    nextAmountMinor: discountStillApplies
      ? calculateDiscountedAmount(params.regularAmountMinor, params.percentOff!).finalAmountMinor
      : params.regularAmountMinor,
  };
}

function validateAdminInput(input: AdminDiscountCodeInput): void {
  if (!Number.isInteger(input.percentOff) || input.percentOff < 1 || input.percentOff > 100) {
    throw new DiscountCodeError('INVALID_PERCENT', 'Discount percentage must be between 1 and 100');
  }
  if (
    input.kind === 'subscription' &&
    input.durationMonths != null &&
    (!Number.isInteger(input.durationMonths) ||
      input.durationMonths < 1 ||
      input.durationMonths > 120)
  ) {
    throw new DiscountCodeError('INVALID_DURATION', 'Duration must be between 1 and 120 months');
  }
  if (input.kind === 'subscription' && input.bundleId) {
    throw new DiscountCodeError('INVALID_SCOPE', 'Subscription codes cannot target bundles');
  }
  if (input.kind === 'bundle' && input.planId) {
    throw new DiscountCodeError('INVALID_SCOPE', 'Bundle codes cannot target plans');
  }
}

async function resolveAssignedUsers(emails: string[]): Promise<string[]> {
  const normalized = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  const userRepo = getUserRepository();
  const users = await Promise.all(normalized.map((email) => userRepo.findByEmail(email)));
  const missing = normalized.filter((_, index) => !users[index]);
  if (missing.length > 0) {
    throw new DiscountCodeError('USERS_NOT_FOUND', `Accounts not found: ${missing.join(', ')}`);
  }
  return users.flatMap((user) => (user ? [user.id] : []));
}

async function validateScopeReferences(input: AdminDiscountCodeInput): Promise<void> {
  if (input.planId && !(await getPlanRepository().findPlanById(input.planId))) {
    throw new DiscountCodeError('PLAN_NOT_FOUND', 'Plan not found');
  }
  if (input.bundleId && !(await getBundleRepository().findBundleById(input.bundleId))) {
    throw new DiscountCodeError('BUNDLE_NOT_FOUND', 'Bundle not found');
  }
}

async function createUniqueCode(): Promise<string> {
  const repository = getDiscountRepository();
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateDiscountCodeValue();
    if (!(await repository.findCodeByValue(code))) return code;
  }
  throw new Error('Failed to generate a unique discount code');
}

export async function listAdminDiscountCodes() {
  return getDiscountRepository().listAdminCodes();
}

export async function getAdminDiscountOptions() {
  const [plans, bundles] = await Promise.all([
    getPlanRepository().findActivePlans(),
    getBundleRepository().findActiveBundles(),
  ]);
  return {
    plans: plans.map((plan) => ({ id: plan.id, slug: plan.slug, name: plan.name })),
    bundles: bundles.map((bundle) => ({ id: bundle.id, slug: bundle.slug, name: bundle.name })),
  };
}

export async function createAdminDiscountCode(input: AdminDiscountCodeInput, adminUserId: string) {
  validateAdminInput(input);
  await validateScopeReferences(input);
  const assignedUserIds = await resolveAssignedUsers(input.assignedUserEmails ?? []);
  const repository = getDiscountRepository();
  const row = await repository.createCode({
    code: await createUniqueCode(),
    kind: input.kind,
    percentOff: input.percentOff,
    durationMonths: input.kind === 'subscription' ? (input.durationMonths ?? null) : null,
    planId: input.kind === 'subscription' ? (input.planId ?? null) : null,
    bundleId: input.kind === 'bundle' ? (input.bundleId ?? null) : null,
    isActive: input.isActive ?? true,
    createdByUserId: adminUserId,
  });
  const newAssignments = await repository.replaceAssignments(row.id, assignedUserIds);
  if (newAssignments.length > 0) {
    enqueuePendingDiscountAssignmentNotifications();
  }
  return (await repository.listAdminCodes()).find((item) => item.id === row.id) ?? row;
}

export async function updateAdminDiscountCode(id: string, input: AdminDiscountCodeInput) {
  validateAdminInput(input);
  await validateScopeReferences(input);
  const repository = getDiscountRepository();
  if (!(await repository.findCodeById(id))) {
    throw new DiscountCodeError('CODE_NOT_FOUND', 'Discount code not found', 404);
  }
  const assignedUserIds = await resolveAssignedUsers(input.assignedUserEmails ?? []);
  await repository.updateCode(id, {
    kind: input.kind,
    percentOff: input.percentOff,
    durationMonths: input.kind === 'subscription' ? (input.durationMonths ?? null) : null,
    planId: input.kind === 'subscription' ? (input.planId ?? null) : null,
    bundleId: input.kind === 'bundle' ? (input.bundleId ?? null) : null,
    isActive: input.isActive ?? true,
    stripeCouponId: null,
    stripeCouponFingerprint: null,
  });
  const newAssignments = await repository.replaceAssignments(id, assignedUserIds);
  if (newAssignments.length > 0) {
    enqueuePendingDiscountAssignmentNotifications();
  }
  return (await repository.listAdminCodes()).find((item) => item.id === id) ?? null;
}

async function assertCodeAvailableToUser(code: DiscountCode, userId: string): Promise<void> {
  if (!code.isActive) {
    throw new DiscountCodeError('CODE_UNAVAILABLE', 'This discount code is not available');
  }
  const repository = getDiscountRepository();
  const assignmentCount = await repository.assignmentCount(code.id);
  if (assignmentCount > 0 && !(await repository.isCodeAssignedToUser(code.id, userId))) {
    throw new DiscountCodeError('CODE_UNAVAILABLE', 'This discount code is not available');
  }
}

export async function previewDiscount(params: {
  userId: string;
  code: string;
  kind: DiscountKind;
  planSlug?: string | null;
  bundleSlug?: string | null;
  requestedBillingCurrency?: string | null;
  now?: Date;
}): Promise<DiscountPreview> {
  const repository = getDiscountRepository();
  const code = await repository.findCodeByValue(normalizeCode(params.code));
  if (!code || code.kind !== params.kind) {
    throw new DiscountCodeError('CODE_UNAVAILABLE', 'This discount code is not available');
  }
  await assertCodeAvailableToUser(code, params.userId);

  const user = await getUserRepository().findById(params.userId);
  if (!user) throw new DiscountCodeError('USER_NOT_FOUND', 'User not found', 404);
  const pricingCurrency = normalizeBillingCurrency(
    params.requestedBillingCurrency || user.preferredBillingCurrency
  );

  let originalAmountMinor: number;
  let planId: string | null = null;
  let planSlug: string | null = null;
  let planName: string | null = null;
  let bundleId: string | null = null;
  let bundleSlug: string | null = null;
  let bundleName: string | null = null;

  if (params.kind === 'subscription') {
    if (!params.planSlug) {
      throw new DiscountCodeError('PLAN_REQUIRED', 'Plan is required');
    }
    const plan = await getPlanRepository().findPlanBySlug(params.planSlug);
    if (!plan) throw new DiscountCodeError('PLAN_NOT_FOUND', 'Plan not found');
    if (code.planId && code.planId !== plan.id) {
      throw new DiscountCodeError(
        'CODE_SCOPE_MISMATCH',
        'This code does not apply to the selected plan'
      );
    }
    const price = await getPlanRepository().findPlanPrice(plan.id, pricingCurrency);
    if (!price) throw new DiscountCodeError('PRICE_NOT_FOUND', 'Plan price is not available');
    if (price.priceMonthly <= 0) {
      throw new DiscountCodeError('FREE_PLAN', 'Discount codes do not apply to free plans');
    }
    const [activeApplication, currentSubscription] = await Promise.all([
      repository.findActiveSubscriptionApplication(params.userId),
      getPlanRepository().findSubscriptionByUserId(params.userId),
    ]);
    const activeDiscountOnCurrentSubscription = !!(
      activeApplication &&
      currentSubscription &&
      ['active', 'trialing'].includes(currentSubscription.status) &&
      currentSubscription.stripeSubscriptionId === activeApplication.stripeSubscriptionId
    );
    if (activeDiscountOnCurrentSubscription) {
      throw new DiscountCodeError(
        'ACTIVE_DISCOUNT_EXISTS',
        'Only one subscription discount can be active at a time'
      );
    }
    if (activeApplication && !activeDiscountOnCurrentSubscription) {
      await repository.cancelApplication(activeApplication.id);
    }
    originalAmountMinor = price.priceMonthly;
    planId = plan.id;
    planSlug = plan.slug;
    planName = plan.name;
  } else {
    if (!params.bundleSlug) {
      throw new DiscountCodeError('BUNDLE_REQUIRED', 'Bundle is required');
    }
    const [bundle, subscription] = await Promise.all([
      getBundleRepository().findBundleBySlug(params.bundleSlug),
      getPlanRepository().findSubscriptionByUserId(params.userId),
    ]);
    if (!bundle || !bundle.isActive) {
      throw new DiscountCodeError('BUNDLE_NOT_FOUND', 'Bundle not found');
    }
    if (!subscription) {
      throw new DiscountCodeError('SUBSCRIPTION_REQUIRED', 'An active subscription is required');
    }
    if (code.bundleId && code.bundleId !== bundle.id) {
      throw new DiscountCodeError(
        'CODE_SCOPE_MISMATCH',
        'This code does not apply to the selected bundle'
      );
    }
    const price = await getBundleRepository().findPriceForPlanAndBundle(
      subscription.planId,
      bundle.id,
      pricingCurrency
    );
    if (!price) throw new DiscountCodeError('PRICE_NOT_FOUND', 'Bundle price is not available');
    originalAmountMinor = price.priceMinor;
    bundleId = bundle.id;
    bundleSlug = bundle.slug;
    bundleName = bundle.name;
  }

  const { discountAmountMinor, finalAmountMinor } = calculateDiscountedAmount(
    originalAmountMinor,
    code.percentOff
  );
  const now = params.now ?? new Date();
  const previewWithoutFingerprint: Omit<DiscountPreview, 'quoteFingerprint'> = {
    code: code.code,
    kind: params.kind,
    percentOff: code.percentOff,
    durationMonths: params.kind === 'subscription' ? code.durationMonths : null,
    originalAmountMinor,
    discountAmountMinor,
    finalAmountMinor,
    pricingCurrency,
    estimatedEndsAt:
      params.kind === 'subscription' && code.durationMonths
        ? addCalendarMonthsClamped(now, code.durationMonths)
        : null,
    planId,
    planSlug,
    planName,
    bundleId,
    bundleSlug,
    bundleName,
    discountCode: code,
  };
  return {
    ...previewWithoutFingerprint,
    quoteFingerprint: discountQuoteFingerprint(previewWithoutFingerprint),
  };
}

export async function createPendingDiscountApplication(
  userId: string,
  preview: DiscountPreview
): Promise<DiscountApplication> {
  return getDiscountRepository().createApplication({
    discountCodeId: preview.discountCode.id,
    userId,
    kind: preview.kind,
    status: 'pending',
    planId: preview.planId,
    bundleId: preview.bundleId,
    percentOffSnapshot: preview.percentOff,
    durationMonthsSnapshot: preview.durationMonths,
    originalAmountMinor: preview.originalAmountMinor,
    discountedAmountMinor: preview.finalAmountMinor,
    pricingCurrency: preview.pricingCurrency,
  });
}

export function stripeCouponFingerprint(code: DiscountCode): string {
  return `${code.kind}:${code.percentOff}:${code.kind === 'subscription' ? (code.durationMonths ?? 'forever') : 'once'}`;
}

export function discountQuoteFingerprint(
  preview: Omit<DiscountPreview, 'quoteFingerprint'>
): string {
  return crypto
    .createHash('sha256')
    .update(
      [
        preview.discountCode.id,
        stripeCouponFingerprint(preview.discountCode),
        preview.originalAmountMinor,
        preview.finalAmountMinor,
        preview.pricingCurrency,
        preview.planId ?? '',
        preview.bundleId ?? '',
      ].join(':')
    )
    .digest('hex')
    .slice(0, 32);
}

export async function activateSubscriptionDiscountApplication(params: {
  applicationId: string;
  userId: string;
  stripeSubscription: Stripe.Subscription;
}): Promise<void> {
  const repository = getDiscountRepository();
  const application = await repository.findApplicationById(params.applicationId);
  if (!application || application.userId !== params.userId || application.kind !== 'subscription') {
    logger.warn(
      { applicationId: params.applicationId, userId: params.userId },
      'Stripe checkout referenced an unknown discount application'
    );
    return;
  }
  const expandedDiscount = params.stripeSubscription.discounts.find(
    (discount): discount is Stripe.Discount => typeof discount !== 'string'
  );
  const startsAt = new Date(
    (expandedDiscount?.start ?? params.stripeSubscription.start_date) * 1000
  );
  const endsAt = expandedDiscount?.end
    ? new Date(expandedDiscount.end * 1000)
    : application.durationMonthsSnapshot
      ? addCalendarMonthsClamped(startsAt, application.durationMonthsSnapshot)
      : null;
  await repository.activateSubscriptionApplication({
    applicationId: application.id,
    userId: params.userId,
    stripeSubscriptionId: params.stripeSubscription.id,
    startsAt,
    endsAt,
  });
}

export async function deliverPendingDiscountAssignmentNotifications(): Promise<void> {
  const repository = getDiscountRepository();
  const pending = await repository.listPendingAssignmentNotifications();
  for (const item of pending) {
    const claimed = await repository.claimAssignmentNotification(
      item.assignmentId,
      item.notificationAttempts
    );
    if (!claimed) continue;
    try {
      await sendDiscountCodeAssignedEmail({
        email: item.email,
        displayName: item.displayName,
        preferredLocale: item.preferredLocale,
        code: item.code,
        kind: item.kind as DiscountKind,
        percentOff: item.percentOff,
        durationMonths: item.durationMonths,
        planName: item.planName,
        bundleName: item.bundleName,
      });
      await repository.markAssignmentNotificationSent(item.assignmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email delivery error';
      await repository.markAssignmentNotificationFailed(item.assignmentId, message);
      logger.error(
        { err: error, assignmentId: item.assignmentId, userId: item.userId },
        'Discount assignment email delivery failed'
      );
    }
  }
}

export function enqueuePendingDiscountAssignmentNotifications(): void {
  void deliverPendingDiscountAssignmentNotifications().catch((error) => {
    logger.error({ err: error }, 'Discount assignment email batch failed');
  });
}

export async function runBillingReminderSweep(now = new Date()): Promise<void> {
  const repository = getDiscountRepository();
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const candidates = await repository.listRenewalsDue(now, cutoff);
  for (const candidate of candidates) {
    if (!candidate.stripeSubscriptionId) continue;
    const price = await getPlanRepository().findPlanPrice(
      candidate.planId,
      normalizeBillingCurrency(candidate.preferredBillingCurrency)
    );
    if (!price) {
      logger.warn(
        { userId: candidate.userId, planId: candidate.planId },
        'Skipping billing reminder because plan price is missing'
      );
      continue;
    }

    const application = await repository.findActiveApplicationForSubscription(
      candidate.stripeSubscriptionId
    );
    const discountEndsAt = application?.endsAt ?? null;
    const { discountEnding, nextAmountMinor } = resolveRenewalReminderPricing({
      regularAmountMinor: price.priceMonthly,
      percentOff: application?.percentOffSnapshot ?? null,
      discountEndsAt,
      periodEnd: candidate.currentPeriodEnd,
      now,
      cutoff,
    });
    if (nextAmountMinor === 0 && !discountEnding) continue;

    const kind = discountEnding ? 'renewal_discount_ending' : 'renewal';
    const deliveryId = await repository.claimReminderDelivery({
      userId: candidate.userId,
      subscriptionId: candidate.subscriptionId,
      kind,
      referenceAt: candidate.currentPeriodEnd,
    });
    if (!deliveryId) continue;

    try {
      await sendBillingRenewalReminderEmail({
        email: candidate.email,
        displayName: candidate.displayName,
        preferredLocale: candidate.preferredLocale,
        planName: candidate.planName,
        chargeAt: candidate.currentPeriodEnd,
        amountMinor: nextAmountMinor,
        pricingCurrency: price.pricingCurrency,
        discountEnding,
        discountEndsAt,
        regularAmountMinor: price.priceMonthly,
      });
      await repository.markReminderSent(deliveryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email delivery error';
      await repository.markReminderFailed(deliveryId, message);
      logger.error(
        { err: error, userId: candidate.userId, subscriptionId: candidate.subscriptionId },
        'Billing reminder email delivery failed'
      );
    }
  }
}
