import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class StoryOutfitPlateCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async getByStoryEnvAndCharacter(
    storyId: string,
    storyEnvironmentId: string,
    characterKey: string,
  ): Promise<schema.StoryOutfitPlateCache | null> {
    const [row] = await this.db
      .select()
      .from(schema.storyOutfitPlateCache)
      .where(
        and(
          eq(schema.storyOutfitPlateCache.storyId, storyId),
          eq(schema.storyOutfitPlateCache.storyEnvironmentId, storyEnvironmentId),
          eq(schema.storyOutfitPlateCache.characterKey, characterKey),
        ),
      )
      .limit(1);
    return row || null;
  }

  async upsert(
    storyId: string,
    storyEnvironmentId: string,
    characterKey: string,
    cacheId: string,
    requestedOutfitText?: string | null,
  ): Promise<schema.StoryOutfitPlateCache> {
    const [row] = await this.db
      .insert(schema.storyOutfitPlateCache)
      .values({
        storyId,
        storyEnvironmentId,
        characterKey,
        cacheId,
        requestedOutfitText: requestedOutfitText?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [
          schema.storyOutfitPlateCache.storyId,
          schema.storyOutfitPlateCache.characterKey,
          schema.storyOutfitPlateCache.storyEnvironmentId,
        ],
        set: {
          cacheId,
          requestedOutfitText: requestedOutfitText?.trim() || null,
        },
      })
      .returning();
    if (!row) throw new Error('StoryOutfitPlateCache upsert failed');
    return row;
  }

  async listByStoryId(storyId: string): Promise<schema.StoryOutfitPlateCache[]> {
    return this.db
      .select()
      .from(schema.storyOutfitPlateCache)
      .where(eq(schema.storyOutfitPlateCache.storyId, storyId));
  }
}
