import { eq, and, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

type DbType = NodePgDatabase<typeof schema>;

export class SceneRepository {
  constructor(private db: DbType) {}

  async findByStoryId(storyId: string): Promise<schema.Scene[]> {
    return this.db
      .select()
      .from(schema.scenes)
      .where(eq(schema.scenes.storyId, storyId))
      .orderBy(schema.scenes.sceneId);
  }

  async findByStoryIds(storyIds: string[]): Promise<schema.Scene[]> {
    if (storyIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.scenes)
      .where(inArray(schema.scenes.storyId, storyIds))
      .orderBy(schema.scenes.sceneId);
  }

  async findByStoryAndSceneId(storyId: string, sceneId: number): Promise<schema.Scene | null> {
    const [scene] = await this.db
      .select()
      .from(schema.scenes)
      .where(and(
        eq(schema.scenes.storyId, storyId),
        eq(schema.scenes.sceneId, sceneId)
      ))
      .limit(1);
    return scene || null;
  }

  async findReferenceImages(storyId: string): Promise<schema.Scene[]> {
    return this.db
      .select()
      .from(schema.scenes)
      .where(and(
        eq(schema.scenes.storyId, storyId),
        eq(schema.scenes.isReferenceImage, true)
      ))
      .orderBy(schema.scenes.sceneId);
  }

  async create(data: schema.NewScene, tx?: DbType): Promise<schema.Scene> {
    const conn = tx || this.db;
    const [scene] = await conn
      .insert(schema.scenes)
      .values(data)
      .returning();
    return scene;
  }

  async createMany(data: schema.NewScene[], tx?: DbType): Promise<schema.Scene[]> {
    if (data.length === 0) return [];
    const conn = tx || this.db;
    return conn
      .insert(schema.scenes)
      .values(data)
      .returning();
  }

  async update(id: string, data: Partial<schema.NewScene>): Promise<void> {
    await this.db
      .update(schema.scenes)
      .set(data)
      .where(eq(schema.scenes.id, id));
  }

  async markAsReference(
    sceneDbId: string,
    charactersPresent: string[],
    imageUrl: string
  ): Promise<void> {
    await this.db
      .update(schema.scenes)
      .set({
        isReferenceImage: true,
        charactersPresent,
        imageUrl,
      })
      .where(eq(schema.scenes.id, sceneDbId));
  }
}
