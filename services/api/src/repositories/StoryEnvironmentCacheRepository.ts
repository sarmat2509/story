import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class StoryEnvironmentCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async getByStoryAndEnvId(
    storyId: string,
    storyEnvironmentId: string
  ): Promise<schema.StoryEnvironmentCache | null> {
    const [row] = await this.db
      .select()
      .from(schema.storyEnvironmentCache)
      .where(
        and(
          eq(schema.storyEnvironmentCache.storyId, storyId),
          eq(schema.storyEnvironmentCache.storyEnvironmentId, storyEnvironmentId)
        )
      )
      .limit(1);
    return row || null;
  }

  async upsert(
    storyId: string,
    storyEnvironmentId: string,
    cacheId: string
  ): Promise<schema.StoryEnvironmentCache> {
    const [row] = await this.db
      .insert(schema.storyEnvironmentCache)
      .values({
        storyId,
        storyEnvironmentId,
        cacheId,
      })
      .onConflictDoUpdate({
        target: [
          schema.storyEnvironmentCache.storyId,
          schema.storyEnvironmentCache.storyEnvironmentId,
        ],
        set: {
          cacheId,
        },
      })
      .returning();
    if (!row) throw new Error('StoryEnvironmentCache upsert failed');
    return row;
  }

  async listByStoryId(storyId: string): Promise<schema.StoryEnvironmentCache[]> {
    return this.db
      .select()
      .from(schema.storyEnvironmentCache)
      .where(eq(schema.storyEnvironmentCache.storyId, storyId));
  }

  async listByCacheId(cacheId: string): Promise<schema.StoryEnvironmentCache[]> {
    return this.db
      .select()
      .from(schema.storyEnvironmentCache)
      .where(eq(schema.storyEnvironmentCache.cacheId, cacheId));
  }
}
