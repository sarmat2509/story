import { eq, and, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface PlanFeatureWithDetails {
  planId: string;
  featureId: string;
  slug: string;
  name: string;
  value: unknown;
  category: string;
}

export interface PlanPriceWithSlug extends schema.PlanPrice {
  planSlug: string;
}

export class PlanRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  // Plans
  async findActivePlans(): Promise<schema.Plan[]> {
    return this.db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.isActive, true))
      .orderBy(schema.plans.sortOrder);
  }

  async findPlanBySlug(slug: string): Promise<schema.Plan | null> {
    const [plan] = await this.db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.slug, slug), eq(schema.plans.isActive, true)))
      .limit(1);
    return plan || null;
  }

  async findPlanById(id: string): Promise<schema.Plan | null> {
    const [plan] = await this.db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, id))
      .limit(1);
    return plan || null;
  }

  async findPlanPricesForPlanIds(planIds: string[]): Promise<schema.PlanPrice[]> {
    if (planIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(schema.planPrices)
      .where(inArray(schema.planPrices.planId, planIds));
  }

  async findPlanPrice(planId: string, pricingCurrency: string): Promise<schema.PlanPrice | null> {
    const [price] = await this.db
      .select()
      .from(schema.planPrices)
      .where(and(
        eq(schema.planPrices.planId, planId),
        eq(schema.planPrices.pricingCurrency, pricingCurrency)
      ))
      .limit(1);
    return price || null;
  }

  async findPlanPriceByStripePriceId(stripePriceId: string): Promise<PlanPriceWithSlug | null> {
    const [row] = await this.db
      .select({
        id: schema.planPrices.id,
        planId: schema.planPrices.planId,
        pricingCurrency: schema.planPrices.pricingCurrency,
        priceMonthly: schema.planPrices.priceMonthly,
        stripePriceId: schema.planPrices.stripePriceId,
        createdAt: schema.planPrices.createdAt,
        updatedAt: schema.planPrices.updatedAt,
        planSlug: schema.plans.slug,
      })
      .from(schema.planPrices)
      .innerJoin(schema.plans, eq(schema.planPrices.planId, schema.plans.id))
      .where(eq(schema.planPrices.stripePriceId, stripePriceId))
      .limit(1);
    return row || null;
  }

  // Features
  async findFeatureBySlug(slug: string): Promise<schema.Feature | null> {
    const [feature] = await this.db
      .select()
      .from(schema.features)
      .where(eq(schema.features.slug, slug))
      .limit(1);
    return feature || null;
  }

  async findFeatureById(id: string): Promise<schema.Feature | null> {
    const [feature] = await this.db
      .select()
      .from(schema.features)
      .where(eq(schema.features.id, id))
      .limit(1);
    return feature || null;
  }

  // Plan Features
  async findPlanFeatures(planId: string): Promise<schema.PlanFeature[]> {
    return this.db
      .select()
      .from(schema.planFeatures)
      .where(eq(schema.planFeatures.planId, planId));
  }

  async findFeaturesForPlans(planIds: string[]): Promise<PlanFeatureWithDetails[]> {
    if (planIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        planId: schema.planFeatures.planId,
        featureId: schema.planFeatures.featureId,
        slug: schema.features.slug,
        name: schema.features.name,
        value: schema.planFeatures.value,
        category: schema.features.category,
      })
      .from(schema.planFeatures)
      .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
      .where(inArray(schema.planFeatures.planId, planIds));
  }

  async findFeatureValue(planId: string, featureSlug: string): Promise<unknown | null> {
    const [result] = await this.db
      .select({ value: schema.planFeatures.value })
      .from(schema.planFeatures)
      .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
      .where(and(
        eq(schema.planFeatures.planId, planId),
        eq(schema.features.slug, featureSlug)
      ))
      .limit(1);
    return result?.value || null;
  }

  async findAllFeaturesForPlan(planId: string): Promise<Array<{ slug: string; value: unknown }>> {
    return this.db
      .select({
        slug: schema.features.slug,
        value: schema.planFeatures.value,
      })
      .from(schema.planFeatures)
      .innerJoin(schema.features, eq(schema.planFeatures.featureId, schema.features.id))
      .where(eq(schema.planFeatures.planId, planId));
  }

  // Subscriptions
  async findSubscriptionByUserId(userId: string): Promise<schema.UserSubscription | null> {
    const [subscription] = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.userId, userId))
      .limit(1);
    return subscription || null;
  }

  async findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<schema.UserSubscription | null> {
    const [subscription] = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    return subscription || null;
  }

  async createSubscription(data: schema.NewUserSubscription): Promise<schema.UserSubscription> {
    const [subscription] = await this.db
      .insert(schema.userSubscriptions)
      .values(data)
      .returning();
    return subscription;
  }

  async updateSubscription(
    userId: string,
    data: Partial<schema.NewUserSubscription>
  ): Promise<schema.UserSubscription> {
    const [updated] = await this.db
      .update(schema.userSubscriptions)
      .set(data)
      .where(eq(schema.userSubscriptions.userId, userId))
      .returning();
    return updated;
  }
}
