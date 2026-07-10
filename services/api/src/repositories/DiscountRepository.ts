import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type AdminDiscountCodeRow = schema.DiscountCode & {
  planSlug: string | null;
  planName: string | null;
  bundleSlug: string | null;
  bundleName: string | null;
  assignments: Array<{
    id: string;
    userId: string;
    email: string;
    displayName: string | null;
    notificationSentAt: Date | null;
  }>;
};

export type PendingDiscountAssignmentNotification = {
  assignmentId: string;
  notificationAttempts: number;
  userId: string;
  email: string;
  displayName: string | null;
  preferredLocale: string;
  code: string;
  kind: string;
  percentOff: number;
  durationMonths: number | null;
  planName: string | null;
  bundleName: string | null;
};

export type RenewalReminderCandidate = {
  subscriptionId: string;
  userId: string;
  email: string;
  displayName: string | null;
  preferredLocale: string;
  preferredBillingCurrency: string;
  planId: string;
  planName: string;
  currentPeriodEnd: Date;
  stripeSubscriptionId: string | null;
};

export class DiscountRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findCodeById(id: string): Promise<schema.DiscountCode | null> {
    const [row] = await this.db
      .select()
      .from(schema.discountCodes)
      .where(eq(schema.discountCodes.id, id))
      .limit(1);
    return row ?? null;
  }

  async findCodeByValue(code: string): Promise<schema.DiscountCode | null> {
    const [row] = await this.db
      .select()
      .from(schema.discountCodes)
      .where(eq(schema.discountCodes.code, code))
      .limit(1);
    return row ?? null;
  }

  async listAdminCodes(): Promise<AdminDiscountCodeRow[]> {
    const rows = await this.db
      .select({
        code: schema.discountCodes,
        planSlug: schema.plans.slug,
        planName: schema.plans.name,
        bundleSlug: schema.storyBundles.slug,
        bundleName: schema.storyBundles.name,
      })
      .from(schema.discountCodes)
      .leftJoin(schema.plans, eq(schema.discountCodes.planId, schema.plans.id))
      .leftJoin(schema.storyBundles, eq(schema.discountCodes.bundleId, schema.storyBundles.id))
      .orderBy(desc(schema.discountCodes.createdAt));

    if (rows.length === 0) return [];
    const assignments = await this.db
      .select({
        id: schema.discountCodeAssignments.id,
        discountCodeId: schema.discountCodeAssignments.discountCodeId,
        userId: schema.discountCodeAssignments.userId,
        email: schema.users.email,
        displayName: schema.users.displayName,
        notificationSentAt: schema.discountCodeAssignments.notificationSentAt,
      })
      .from(schema.discountCodeAssignments)
      .innerJoin(schema.users, eq(schema.discountCodeAssignments.userId, schema.users.id))
      .where(
        inArray(
          schema.discountCodeAssignments.discountCodeId,
          rows.map((row) => row.code.id)
        )
      )
      .orderBy(asc(schema.users.email));

    const byCode = new Map<string, AdminDiscountCodeRow['assignments']>();
    for (const assignment of assignments) {
      const list = byCode.get(assignment.discountCodeId) ?? [];
      list.push({
        id: assignment.id,
        userId: assignment.userId,
        email: assignment.email,
        displayName: assignment.displayName,
        notificationSentAt: assignment.notificationSentAt,
      });
      byCode.set(assignment.discountCodeId, list);
    }

    return rows.map((row) => ({
      ...row.code,
      planSlug: row.planSlug,
      planName: row.planName,
      bundleSlug: row.bundleSlug,
      bundleName: row.bundleName,
      assignments: byCode.get(row.code.id) ?? [],
    }));
  }

  async createCode(data: schema.NewDiscountCode): Promise<schema.DiscountCode> {
    const [row] = await this.db.insert(schema.discountCodes).values(data).returning();
    return row;
  }

  async updateCode(
    id: string,
    data: Partial<schema.NewDiscountCode>
  ): Promise<schema.DiscountCode | null> {
    const [row] = await this.db
      .update(schema.discountCodes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.discountCodes.id, id))
      .returning();
    return row ?? null;
  }

  async updateStripeCoupon(
    id: string,
    stripeCouponId: string,
    stripeCouponFingerprint: string
  ): Promise<void> {
    await this.db
      .update(schema.discountCodes)
      .set({ stripeCouponId, stripeCouponFingerprint, updatedAt: new Date() })
      .where(eq(schema.discountCodes.id, id));
  }

  async assignmentCount(discountCodeId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.discountCodeAssignments)
      .where(eq(schema.discountCodeAssignments.discountCodeId, discountCodeId));
    return row?.count ?? 0;
  }

  async isCodeAssignedToUser(discountCodeId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.discountCodeAssignments.id })
      .from(schema.discountCodeAssignments)
      .where(
        and(
          eq(schema.discountCodeAssignments.discountCodeId, discountCodeId),
          eq(schema.discountCodeAssignments.userId, userId)
        )
      )
      .limit(1);
    return !!row;
  }

  async replaceAssignments(discountCodeId: string, userIds: string[]): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ userId: schema.discountCodeAssignments.userId })
        .from(schema.discountCodeAssignments)
        .where(eq(schema.discountCodeAssignments.discountCodeId, discountCodeId));
      const existingIds = new Set(existing.map((row) => row.userId));

      if (userIds.length === 0) {
        await tx
          .delete(schema.discountCodeAssignments)
          .where(eq(schema.discountCodeAssignments.discountCodeId, discountCodeId));
      } else {
        await tx
          .delete(schema.discountCodeAssignments)
          .where(
            and(
              eq(schema.discountCodeAssignments.discountCodeId, discountCodeId),
              notInArray(schema.discountCodeAssignments.userId, userIds)
            )
          );
        await tx
          .insert(schema.discountCodeAssignments)
          .values(userIds.map((userId) => ({ discountCodeId, userId })))
          .onConflictDoNothing();
      }

      return userIds.filter((userId) => !existingIds.has(userId));
    });
  }

  async listPendingAssignmentNotifications(
    limit = 50
  ): Promise<PendingDiscountAssignmentNotification[]> {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    return this.db
      .select({
        assignmentId: schema.discountCodeAssignments.id,
        notificationAttempts: schema.discountCodeAssignments.notificationAttempts,
        userId: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        preferredLocale: schema.users.preferredLocale,
        code: schema.discountCodes.code,
        kind: schema.discountCodes.kind,
        percentOff: schema.discountCodes.percentOff,
        durationMonths: schema.discountCodes.durationMonths,
        planName: schema.plans.name,
        bundleName: schema.storyBundles.name,
      })
      .from(schema.discountCodeAssignments)
      .innerJoin(
        schema.discountCodes,
        eq(schema.discountCodeAssignments.discountCodeId, schema.discountCodes.id)
      )
      .innerJoin(schema.users, eq(schema.discountCodeAssignments.userId, schema.users.id))
      .leftJoin(schema.plans, eq(schema.discountCodes.planId, schema.plans.id))
      .leftJoin(schema.storyBundles, eq(schema.discountCodes.bundleId, schema.storyBundles.id))
      .where(
        and(
          isNull(schema.discountCodeAssignments.notificationSentAt),
          lt(schema.discountCodeAssignments.notificationAttempts, 5),
          or(
            eq(schema.discountCodeAssignments.notificationAttempts, 0),
            lt(schema.discountCodeAssignments.updatedAt, staleBefore)
          ),
          eq(schema.discountCodes.isActive, true)
        )
      )
      .orderBy(asc(schema.discountCodeAssignments.createdAt))
      .limit(limit);
  }

  async claimAssignmentNotification(
    assignmentId: string,
    expectedAttempts: number
  ): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const [claimed] = await this.db
      .update(schema.discountCodeAssignments)
      .set({
        notificationAttempts: expectedAttempts + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.discountCodeAssignments.id, assignmentId),
          isNull(schema.discountCodeAssignments.notificationSentAt),
          eq(schema.discountCodeAssignments.notificationAttempts, expectedAttempts),
          or(
            eq(schema.discountCodeAssignments.notificationAttempts, 0),
            lt(schema.discountCodeAssignments.updatedAt, staleBefore)
          )
        )
      )
      .returning({ id: schema.discountCodeAssignments.id });
    return !!claimed;
  }

  async markAssignmentNotificationSent(assignmentId: string): Promise<void> {
    await this.db
      .update(schema.discountCodeAssignments)
      .set({
        notificationSentAt: new Date(),
        lastNotificationError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.discountCodeAssignments.id, assignmentId));
  }

  async markAssignmentNotificationFailed(assignmentId: string, error: string): Promise<void> {
    await this.db
      .update(schema.discountCodeAssignments)
      .set({
        lastNotificationError: error.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(schema.discountCodeAssignments.id, assignmentId));
  }

  async createApplication(
    data: schema.NewDiscountApplication
  ): Promise<schema.DiscountApplication> {
    const [row] = await this.db.insert(schema.discountApplications).values(data).returning();
    return row;
  }

  async findApplicationById(id: string): Promise<schema.DiscountApplication | null> {
    const [row] = await this.db
      .select()
      .from(schema.discountApplications)
      .where(eq(schema.discountApplications.id, id))
      .limit(1);
    return row ?? null;
  }

  async attachCheckoutSession(applicationId: string, checkoutSessionId: string): Promise<void> {
    await this.db
      .update(schema.discountApplications)
      .set({ checkoutSessionId, updatedAt: new Date() })
      .where(eq(schema.discountApplications.id, applicationId));
  }

  async cancelApplication(applicationId: string): Promise<void> {
    await this.db
      .update(schema.discountApplications)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(schema.discountApplications.id, applicationId));
  }

  async cancelApplicationByCheckoutSession(checkoutSessionId: string): Promise<void> {
    await this.db
      .update(schema.discountApplications)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(schema.discountApplications.checkoutSessionId, checkoutSessionId));
  }

  async activateSubscriptionApplication(params: {
    applicationId: string;
    userId: string;
    stripeSubscriptionId: string;
    startsAt: Date;
    endsAt: Date | null;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.discountApplications)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(
          and(
            eq(schema.discountApplications.userId, params.userId),
            eq(schema.discountApplications.kind, 'subscription'),
            eq(schema.discountApplications.status, 'active'),
            ne(schema.discountApplications.id, params.applicationId)
          )
        );
      await tx
        .update(schema.discountApplications)
        .set({
          status: 'active',
          stripeSubscriptionId: params.stripeSubscriptionId,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.discountApplications.id, params.applicationId));
    });
  }

  async completeBundleApplication(checkoutSessionId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(schema.discountApplications)
      .set({ status: 'completed', startsAt: now, endsAt: now, updatedAt: now })
      .where(eq(schema.discountApplications.checkoutSessionId, checkoutSessionId));
  }

  async cancelSubscriptionApplications(stripeSubscriptionId: string): Promise<void> {
    await this.db
      .update(schema.discountApplications)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(
        and(
          eq(schema.discountApplications.stripeSubscriptionId, stripeSubscriptionId),
          eq(schema.discountApplications.status, 'active')
        )
      );
  }

  async findActiveSubscriptionApplication(
    userId: string,
    at = new Date()
  ): Promise<schema.DiscountApplication | null> {
    const [row] = await this.db
      .select()
      .from(schema.discountApplications)
      .where(
        and(
          eq(schema.discountApplications.userId, userId),
          eq(schema.discountApplications.kind, 'subscription'),
          eq(schema.discountApplications.status, 'active'),
          or(isNull(schema.discountApplications.endsAt), gt(schema.discountApplications.endsAt, at))
        )
      )
      .orderBy(desc(schema.discountApplications.createdAt))
      .limit(1);
    return row ?? null;
  }

  async findActiveApplicationForSubscription(
    stripeSubscriptionId: string
  ): Promise<schema.DiscountApplication | null> {
    const [row] = await this.db
      .select()
      .from(schema.discountApplications)
      .where(
        and(
          eq(schema.discountApplications.stripeSubscriptionId, stripeSubscriptionId),
          eq(schema.discountApplications.status, 'active')
        )
      )
      .orderBy(desc(schema.discountApplications.createdAt))
      .limit(1);
    return row ?? null;
  }

  async listRenewalsDue(now: Date, cutoff: Date): Promise<RenewalReminderCandidate[]> {
    return this.db
      .select({
        subscriptionId: schema.userSubscriptions.id,
        userId: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        preferredLocale: schema.users.preferredLocale,
        preferredBillingCurrency: schema.users.preferredBillingCurrency,
        planId: schema.plans.id,
        planName: schema.plans.name,
        currentPeriodEnd: schema.userSubscriptions.currentPeriodEnd,
        stripeSubscriptionId: schema.userSubscriptions.stripeSubscriptionId,
      })
      .from(schema.userSubscriptions)
      .innerJoin(schema.users, eq(schema.userSubscriptions.userId, schema.users.id))
      .innerJoin(schema.plans, eq(schema.userSubscriptions.planId, schema.plans.id))
      .where(
        and(
          inArray(schema.userSubscriptions.status, ['active', 'trialing']),
          eq(schema.userSubscriptions.paymentProvider, 'stripe'),
          eq(schema.userSubscriptions.cancelAtPeriodEnd, false),
          gt(schema.userSubscriptions.currentPeriodEnd, now),
          lt(schema.userSubscriptions.currentPeriodEnd, cutoff)
        )
      )
      .orderBy(asc(schema.userSubscriptions.currentPeriodEnd));
  }

  async claimReminderDelivery(params: {
    userId: string;
    subscriptionId: string;
    kind: string;
    referenceAt: Date;
  }): Promise<string | null> {
    const [created] = await this.db
      .insert(schema.billingReminderDeliveries)
      .values({ ...params, status: 'sending' })
      .onConflictDoNothing()
      .returning({ id: schema.billingReminderDeliveries.id });
    if (created) return created.id;

    const [existing] = await this.db
      .select()
      .from(schema.billingReminderDeliveries)
      .where(
        and(
          eq(schema.billingReminderDeliveries.userId, params.userId),
          eq(schema.billingReminderDeliveries.kind, params.kind),
          eq(schema.billingReminderDeliveries.referenceAt, params.referenceAt)
        )
      )
      .limit(1);
    if (!existing || existing.status === 'sent' || existing.attempts >= 5) return null;

    const staleBefore = new Date(Date.now() - 60 * 60 * 1000);
    if (existing.status === 'sending' && existing.updatedAt > staleBefore) return null;

    const [claimed] = await this.db
      .update(schema.billingReminderDeliveries)
      .set({
        status: 'sending',
        attempts: existing.attempts + 1,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.billingReminderDeliveries.id, existing.id),
          or(
            eq(schema.billingReminderDeliveries.status, 'failed'),
            and(
              eq(schema.billingReminderDeliveries.status, 'sending'),
              lt(schema.billingReminderDeliveries.updatedAt, staleBefore)
            )
          )
        )
      )
      .returning({ id: schema.billingReminderDeliveries.id });
    return claimed?.id ?? null;
  }

  async markReminderSent(deliveryId: string): Promise<void> {
    await this.db
      .update(schema.billingReminderDeliveries)
      .set({ status: 'sent', sentAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(schema.billingReminderDeliveries.id, deliveryId));
  }

  async markReminderFailed(deliveryId: string, error: string): Promise<void> {
    await this.db
      .update(schema.billingReminderDeliveries)
      .set({ status: 'failed', lastError: error.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.billingReminderDeliveries.id, deliveryId));
  }
}
