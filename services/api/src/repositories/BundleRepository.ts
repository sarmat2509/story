import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class BundleRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findActiveBundles(): Promise<schema.StoryBundle[]> {
    return this.db
      .select()
      .from(schema.storyBundles)
      .where(eq(schema.storyBundles.isActive, true))
      .orderBy(schema.storyBundles.sortOrder);
  }

  async findBundleBySlug(slug: string): Promise<schema.StoryBundle | null> {
    const [row] = await this.db
      .select()
      .from(schema.storyBundles)
      .where(eq(schema.storyBundles.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async findBundleById(id: string): Promise<schema.StoryBundle | null> {
    const [row] = await this.db
      .select()
      .from(schema.storyBundles)
      .where(eq(schema.storyBundles.id, id))
      .limit(1);
    return row ?? null;
  }

  async findPriceForPlanAndBundle(
    planId: string,
    bundleId: string,
    pricingCurrency?: string
  ): Promise<schema.PlanBundlePrice | null> {
    const [row] = await this.db
      .select()
      .from(schema.planBundlePrices)
      .where(
        and(
          eq(schema.planBundlePrices.planId, planId),
          eq(schema.planBundlePrices.bundleId, bundleId),
          pricingCurrency
            ? eq(schema.planBundlePrices.pricingCurrency, pricingCurrency)
            : undefined
        )
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Active bundles with price row for a plan (for API listing).
   */
  async listBundlesWithPricesForPlan(planId: string, pricingCurrency: string): Promise<
    Array<{
      bundle: schema.StoryBundle;
      price: schema.PlanBundlePrice;
    }>
  > {
    const rows = await this.db
      .select({
        bundle: schema.storyBundles,
        price: schema.planBundlePrices,
      })
      .from(schema.storyBundles)
      .innerJoin(
        schema.planBundlePrices,
        and(
          eq(schema.planBundlePrices.bundleId, schema.storyBundles.id),
          eq(schema.planBundlePrices.planId, planId),
          eq(schema.planBundlePrices.pricingCurrency, pricingCurrency)
        )
      )
      .where(eq(schema.storyBundles.isActive, true))
      .orderBy(schema.storyBundles.sortOrder);

    return rows.map((r) => ({
      bundle: r.bundle,
      price: r.price,
    }));
  }

  /**
   * Sum extra stories/audio from grants whose period intersects [periodStart, periodEnd).
   */
  async sumGrantBonusForPeriod(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{ extraStories: number; extraAudio: number }> {
    const [row] = await this.db
      .select({
        extraStories: sql<number>`coalesce(sum(${schema.userBundleGrants.extraStories}), 0)`,
        extraAudio: sql<number>`coalesce(sum(${schema.userBundleGrants.extraAudio}), 0)`,
      })
      .from(schema.userBundleGrants)
      .where(
        and(
          eq(schema.userBundleGrants.userId, userId),
          lt(schema.userBundleGrants.subscriptionPeriodStart, periodEnd),
          gt(schema.userBundleGrants.subscriptionPeriodEnd, periodStart)
        )
      );

    return {
      extraStories: Number(row?.extraStories ?? 0),
      extraAudio: Number(row?.extraAudio ?? 0),
    };
  }

  async insertGrant(data: schema.NewUserBundleGrant): Promise<schema.UserBundleGrant> {
    const [row] = await this.db.insert(schema.userBundleGrants).values(data).returning();
    if (!row) {
      throw new Error('Failed to insert user_bundle_grant');
    }
    return row;
  }

  async findGrantByStripeSessionId(sessionId: string): Promise<schema.UserBundleGrant | null> {
    const [row] = await this.db
      .select()
      .from(schema.userBundleGrants)
      .where(eq(schema.userBundleGrants.stripeCheckoutSessionId, sessionId))
      .limit(1);
    return row ?? null;
  }
}
