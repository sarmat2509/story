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

  async findAllTones(): Promise<schema.StoryTone[]> {
    return this.db
      .select()
      .from(schema.storyTones)
      .orderBy(schema.storyTones.sortOrder);
  }

  async findActiveScenarioCards(): Promise<schema.ScenarioCard[]> {
    return this.db
      .select()
      .from(schema.scenarioCards)
      .where(eq(schema.scenarioCards.isActive, true))
      .orderBy(schema.scenarioCards.sortOrder);
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
}
