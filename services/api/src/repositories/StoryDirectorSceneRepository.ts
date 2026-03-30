import { asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class StoryDirectorSceneRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async replaceForStory(
    storyId: string,
    rows: Array<
      Omit<
        schema.NewStoryDirectorScene,
        'id' | 'storyId' | 'createdAt'
      >
    >,
    tx?: NodePgDatabase<typeof schema>
  ): Promise<void> {
    const conn = tx || this.db;
    await conn.delete(schema.storyDirectorScenes).where(eq(schema.storyDirectorScenes.storyId, storyId));

    if (rows.length === 0) {
      return;
    }

    await conn.insert(schema.storyDirectorScenes).values(
      rows.map((row) => ({
        ...row,
        storyId,
      })),
    );
  }

  async listByStoryId(storyId: string): Promise<schema.StoryDirectorScene[]> {
    return this.db
      .select()
      .from(schema.storyDirectorScenes)
      .where(eq(schema.storyDirectorScenes.storyId, storyId))
      .orderBy(asc(schema.storyDirectorScenes.sceneIndex));
  }
}
