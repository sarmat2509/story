import { asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type AdminConfigResource =
  | 'plans'
  | 'features'
  | 'planFeatures'
  | 'translations'
  | 'storyGoals'
  | 'contentPolicyRules'
  | 'ageEngineRules'
  | 'scenarioCards'
  | 'scenarioPlotExamples'
  | 'scenarioWorldRules';

export class AdminConfigRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async list(resource: AdminConfigResource) {
    switch (resource) {
      case 'plans':
        return this.db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder));
      case 'features':
        return this.db.select().from(schema.features).orderBy(
          asc(schema.features.category),
          asc(schema.features.slug),
        );
      case 'planFeatures':
        return this.db.select().from(schema.planFeatures).orderBy(
          asc(schema.planFeatures.planId),
          asc(schema.planFeatures.featureId),
        );
      case 'translations':
        return this.db.select().from(schema.translations).orderBy(
          asc(schema.translations.entityType),
          asc(schema.translations.entityId),
          asc(schema.translations.locale),
          asc(schema.translations.fieldName),
        );
      case 'storyGoals':
        return this.db.select().from(schema.storyGoals).orderBy(asc(schema.storyGoals.sortOrder));
      case 'contentPolicyRules':
        return this.db.select().from(schema.contentPolicyRules).orderBy(asc(schema.contentPolicyRules.sortOrder));
      case 'ageEngineRules':
        return this.db.select().from(schema.ageEngineRules).orderBy(asc(schema.ageEngineRules.ageGroup));
      case 'scenarioCards':
        return this.db.select().from(schema.scenarioCards).orderBy(asc(schema.scenarioCards.sortOrder));
      case 'scenarioPlotExamples':
        return this.db.select().from(schema.scenarioPlotExamples).orderBy(
          asc(schema.scenarioPlotExamples.scenarioCardId),
          asc(schema.scenarioPlotExamples.sortOrder),
        );
      case 'scenarioWorldRules':
        return this.db.select().from(schema.scenarioWorldRules).orderBy(
          asc(schema.scenarioWorldRules.scenarioCardId),
          asc(schema.scenarioWorldRules.sortOrder),
        );
      default:
        return [];
    }
  }

  async updateStoryGoal(
    slug: string,
    patch: Partial<typeof schema.storyGoals.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.storyGoals)
      .set(patch)
      .where(eq(schema.storyGoals.slug, slug))
      .returning();
    return item ?? null;
  }

  async updateContentPolicyRule(
    id: string,
    patch: Partial<typeof schema.contentPolicyRules.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.contentPolicyRules)
      .set(patch)
      .where(eq(schema.contentPolicyRules.id, id))
      .returning();
    return item ?? null;
  }

  async updateAgeEngineRule(
    ageGroup: string,
    patch: Partial<typeof schema.ageEngineRules.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.ageEngineRules)
      .set(patch)
      .where(eq(schema.ageEngineRules.ageGroup, ageGroup))
      .returning();
    return item ?? null;
  }

  async updateScenarioCard(
    id: string,
    patch: Partial<typeof schema.scenarioCards.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.scenarioCards)
      .set(patch)
      .where(eq(schema.scenarioCards.id, id))
      .returning();
    return item ?? null;
  }

  async updateScenarioPlotExample(
    id: string,
    patch: Partial<typeof schema.scenarioPlotExamples.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.scenarioPlotExamples)
      .set(patch)
      .where(eq(schema.scenarioPlotExamples.id, id))
      .returning();
    return item ?? null;
  }

  async updateScenarioWorldRule(
    id: string,
    patch: Partial<typeof schema.scenarioWorldRules.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.scenarioWorldRules)
      .set(patch)
      .where(eq(schema.scenarioWorldRules.id, id))
      .returning();
    return item ?? null;
  }

  async updatePlan(
    id: string,
    patch: Partial<typeof schema.plans.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.plans)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.plans.id, id))
      .returning();
    return item ?? null;
  }

  async updateFeature(
    id: string,
    patch: Partial<typeof schema.features.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.features)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.features.id, id))
      .returning();
    return item ?? null;
  }

  async updatePlanFeature(
    id: string,
    patch: Partial<typeof schema.planFeatures.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.planFeatures)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.planFeatures.id, id))
      .returning();
    return item ?? null;
  }

  async updateTranslation(
    id: string,
    patch: Partial<typeof schema.translations.$inferInsert>,
  ) {
    const [item] = await this.db
      .update(schema.translations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.translations.id, id))
      .returning();
    return item ?? null;
  }

  async createStoryGoal(input: typeof schema.storyGoals.$inferInsert) {
    const [item] = await this.db.insert(schema.storyGoals).values(input).returning();
    return item ?? null;
  }

  async createContentPolicyRule(input: typeof schema.contentPolicyRules.$inferInsert) {
    const [item] = await this.db.insert(schema.contentPolicyRules).values(input).returning();
    return item ?? null;
  }

  async createAgeEngineRule(input: typeof schema.ageEngineRules.$inferInsert) {
    const [item] = await this.db.insert(schema.ageEngineRules).values(input).returning();
    return item ?? null;
  }

  async createScenarioCard(input: typeof schema.scenarioCards.$inferInsert) {
    const [item] = await this.db.insert(schema.scenarioCards).values(input).returning();
    return item ?? null;
  }

  async createScenarioPlotExample(input: typeof schema.scenarioPlotExamples.$inferInsert) {
    const [item] = await this.db.insert(schema.scenarioPlotExamples).values(input).returning();
    return item ?? null;
  }

  async createScenarioWorldRule(input: typeof schema.scenarioWorldRules.$inferInsert) {
    const [item] = await this.db.insert(schema.scenarioWorldRules).values(input).returning();
    return item ?? null;
  }

  async createPlan(input: typeof schema.plans.$inferInsert) {
    const [item] = await this.db.insert(schema.plans).values(input).returning();
    return item ?? null;
  }

  async createFeature(input: typeof schema.features.$inferInsert) {
    const [item] = await this.db.insert(schema.features).values(input).returning();
    return item ?? null;
  }

  async createPlanFeature(input: typeof schema.planFeatures.$inferInsert) {
    const [item] = await this.db.insert(schema.planFeatures).values(input).returning();
    return item ?? null;
  }

  async createTranslation(input: typeof schema.translations.$inferInsert) {
    const [item] = await this.db.insert(schema.translations).values(input).returning();
    return item ?? null;
  }

  async deletePlan(id: string) {
    const [item] = await this.db.delete(schema.plans).where(eq(schema.plans.id, id)).returning();
    return item ?? null;
  }

  async deleteFeature(id: string) {
    const [item] = await this.db.delete(schema.features).where(eq(schema.features.id, id)).returning();
    return item ?? null;
  }

  async deletePlanFeature(id: string) {
    const [item] = await this.db.delete(schema.planFeatures).where(eq(schema.planFeatures.id, id)).returning();
    return item ?? null;
  }

  async deleteTranslation(id: string) {
    const [item] = await this.db.delete(schema.translations).where(eq(schema.translations.id, id)).returning();
    return item ?? null;
  }

  async deleteStoryGoal(slug: string) {
    const [item] = await this.db.delete(schema.storyGoals).where(eq(schema.storyGoals.slug, slug)).returning();
    return item ?? null;
  }

  async deleteContentPolicyRule(id: string) {
    const [item] = await this.db.delete(schema.contentPolicyRules).where(eq(schema.contentPolicyRules.id, id)).returning();
    return item ?? null;
  }

  async deleteAgeEngineRule(ageGroup: string) {
    const [item] = await this.db.delete(schema.ageEngineRules).where(eq(schema.ageEngineRules.ageGroup, ageGroup)).returning();
    return item ?? null;
  }

  async deleteScenarioCard(id: string) {
    const [item] = await this.db.delete(schema.scenarioCards).where(eq(schema.scenarioCards.id, id)).returning();
    return item ?? null;
  }

  async deleteScenarioPlotExample(id: string) {
    const [item] = await this.db.delete(schema.scenarioPlotExamples).where(eq(schema.scenarioPlotExamples.id, id)).returning();
    return item ?? null;
  }

  async deleteScenarioWorldRule(id: string) {
    const [item] = await this.db.delete(schema.scenarioWorldRules).where(eq(schema.scenarioWorldRules.id, id)).returning();
    return item ?? null;
  }
}
