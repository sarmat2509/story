import { asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class StoryGenerationStageEventRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(
    input: schema.NewStoryGenerationStageEvent
  ): Promise<schema.StoryGenerationStageEvent> {
    const [row] = await this.db.insert(schema.storyGenerationStageEvents).values(input).returning();
    if (!row) throw new Error('Failed to create story_generation_stage_event');
    return row;
  }

  async listByStoryId(storyId: string): Promise<schema.StoryGenerationStageEvent[]> {
    return this.db
      .select()
      .from(schema.storyGenerationStageEvents)
      .where(eq(schema.storyGenerationStageEvents.storyId, storyId))
      .orderBy(
        asc(schema.storyGenerationStageEvents.startedAt),
        asc(schema.storyGenerationStageEvents.createdAt)
      );
  }
}
