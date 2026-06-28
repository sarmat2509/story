import { eq, and, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class DictionaryRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findAllGoals(): Promise<schema.StoryGoal[]> {
    return this.db
      .select()
      .from(schema.storyGoals)
      .orderBy(schema.storyGoals.sortOrder);
  }

  async findActiveScenarioCards(): Promise<schema.ScenarioCard[]> {
    return this.db
      .select()
      .from(schema.scenarioCards)
      .where(eq(schema.scenarioCards.isActive, true))
      .orderBy(schema.scenarioCards.sortOrder);
  }

  async findActiveAgeGroups(): Promise<schema.AgeGroup[]> {
    return this.db
      .select()
      .from(schema.ageGroups)
      .where(eq(schema.ageGroups.isActive, true))
      .orderBy(schema.ageGroups.sortOrder);
  }

  async findScenarioCardById(id: string): Promise<schema.ScenarioCard | null> {
    const [card] = await this.db
      .select()
      .from(schema.scenarioCards)
      .where(eq(schema.scenarioCards.id, id))
      .limit(1);
    return card || null;
  }

  async findGoalBySlug(slug: string): Promise<schema.StoryGoal | null> {
    const [goal] = await this.db
      .select()
      .from(schema.storyGoals)
      .where(eq(schema.storyGoals.slug, slug))
      .limit(1);
    return goal || null;
  }

  async findActivePlotExamples(scenarioCardId: string): Promise<schema.ScenarioPlotExample[]> {
    return this.db.select()
      .from(schema.scenarioPlotExamples)
      .where(and(
        eq(schema.scenarioPlotExamples.scenarioCardId, scenarioCardId),
        eq(schema.scenarioPlotExamples.isActive, true),
      ))
      .orderBy(schema.scenarioPlotExamples.sortOrder);
  }

  async findActiveWorldRules(scenarioCardId: string): Promise<schema.ScenarioWorldRule[]> {
    return this.db.select()
      .from(schema.scenarioWorldRules)
      .where(and(
        eq(schema.scenarioWorldRules.scenarioCardId, scenarioCardId),
        eq(schema.scenarioWorldRules.isActive, true),
      ))
      .orderBy(schema.scenarioWorldRules.sortOrder);
  }

  async findTranslations(
    entityType: string,
    entityIds: string[],
    locale: string
  ): Promise<schema.Translation[]> {
    if (entityIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.translations)
      .where(
        and(
          eq(schema.translations.entityType, entityType),
          inArray(schema.translations.entityId, entityIds),
          eq(schema.translations.locale, locale)
        )
      );
  }

  async findTranslationsForEntities(
    entityType: string,
    entityIds: string[],
    fieldName?: string
  ): Promise<schema.Translation[]> {
    if (entityIds.length === 0) return [];
    const conditions = [
      eq(schema.translations.entityType, entityType),
      inArray(schema.translations.entityId, entityIds),
    ];
    if (fieldName) {
      conditions.push(eq(schema.translations.fieldName, fieldName));
    }

    return this.db
      .select()
      .from(schema.translations)
      .where(and(...conditions));
  }

  async upsertTranslation(input: schema.NewTranslation): Promise<schema.Translation> {
    const now = new Date();
    const [translation] = await this.db
      .insert(schema.translations)
      .values({
        ...input,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.translations.entityType,
          schema.translations.entityId,
          schema.translations.locale,
          schema.translations.fieldName,
        ],
        set: {
          value: input.value,
          updatedAt: now,
        },
      })
      .returning();

    if (!translation) throw new Error('Translation upsert failed');
    return translation;
  }
}
