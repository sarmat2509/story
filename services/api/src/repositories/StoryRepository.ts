import { eq, and, desc, sql, isNotNull, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class StoryRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  // ── Transaction helper ──

  async transaction<T>(fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  // ── Stories ──

  async findById(id: string): Promise<schema.Story | null> {
    const [story] = await this.db
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.id, id))
      .limit(1);
    return story || null;
  }

  async findByIdAndUser(id: string, userId: string): Promise<schema.Story | null> {
    const [story] = await this.db
      .select()
      .from(schema.stories)
      .where(and(
        eq(schema.stories.id, id),
        eq(schema.stories.userId, userId)
      ))
      .limit(1);
    return story || null;
  }

  async findByPublishedSlug(slug: string): Promise<schema.Story | null> {
    const [story] = await this.db
      .select()
      .from(schema.stories)
      .where(and(
        eq(schema.stories.publishedSlug, slug),
        eq(schema.stories.isPublished, true)
      ))
      .limit(1);
    return story || null;
  }

  async listPublished(options: { limit?: number; offset?: number } = {}): Promise<schema.Story[]> {
    const { limit = 20, offset = 0 } = options;
    return this.db
      .select()
      .from(schema.stories)
      .where(and(
        eq(schema.stories.isPublished, true),
        isNotNull(schema.stories.publishedSlug)
      ))
      .orderBy(desc(schema.stories.publishedAt))
      .limit(limit)
      .offset(offset);
  }

  async countPublished(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.stories)
      .where(and(
        eq(schema.stories.isPublished, true),
        isNotNull(schema.stories.publishedSlug)
      ));
    return Number(result[0]?.count ?? 0);
  }

  async findByUser(
    userId: string,
    options: { limit?: number; offset?: number; hasAudio?: boolean; scenarioCardId?: string } = {}
  ): Promise<schema.Story[]> {
    const { limit = 20, offset = 0, hasAudio, scenarioCardId } = options;
    const conditions = [eq(schema.stories.userId, userId)];
    if (hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (scenarioCardId) {
      conditions.push(eq(schema.storyRequests.scenarioCardId, scenarioCardId));
      const rows = await this.db
        .select({ story: schema.stories })
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions))
        .orderBy(desc(schema.stories.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map(r => r.story);
    }
    return this.db
      .select()
      .from(schema.stories)
      .where(and(...conditions))
      .orderBy(desc(schema.stories.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async findSummariesByUser(
    userId: string,
    options: { limit?: number; offset?: number; hasAudio?: boolean; scenarioCardId?: string } = {}
  ): Promise<Array<{
    id: string;
    title: string;
    language: string;
    isPublished: boolean | null;
    audioMetadata: unknown;
    scenes: unknown;
    createdAt: Date;
    scenarioCardId: string | null;
  }>> {
    const { limit = 20, offset = 0, hasAudio, scenarioCardId } = options;
    const conditions = [eq(schema.stories.userId, userId)];
    if (hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    const selectFields = {
      id: schema.stories.id,
      title: schema.stories.title,
      language: schema.stories.language,
      isPublished: schema.stories.isPublished,
      audioMetadata: schema.stories.audioMetadata,
      scenes: schema.stories.scenes,
      createdAt: schema.stories.createdAt,
      scenarioCardId: schema.storyRequests.scenarioCardId,
    };
    if (scenarioCardId) {
      conditions.push(eq(schema.storyRequests.scenarioCardId, scenarioCardId));
      return this.db
        .select(selectFields)
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions))
        .orderBy(desc(schema.stories.createdAt))
        .limit(limit)
        .offset(offset);
    }
    return this.db
      .select(selectFields)
      .from(schema.stories)
      .leftJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
      .where(and(...conditions))
      .orderBy(desc(schema.stories.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countByUser(userId: string, options: { hasAudio?: boolean; scenarioCardId?: string } = {}): Promise<number> {
    const conditions = [eq(schema.stories.userId, userId)];
    if (options.hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (options.scenarioCardId) {
      conditions.push(eq(schema.storyRequests.scenarioCardId, options.scenarioCardId));
      const result = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions));
      return result[0]?.count || 0;
    }
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.stories)
      .where(and(...conditions));
    return result[0]?.count || 0;
  }

  async createStory(
    data: schema.NewStory,
    tx?: NodePgDatabase<typeof schema>
  ): Promise<schema.Story> {
    const conn = tx || this.db;
    const [story] = await conn
      .insert(schema.stories)
      .values(data)
      .returning();
    return story;
  }

  async updateStory(
    id: string,
    data: Partial<schema.NewStory>,
    tx?: NodePgDatabase<typeof schema>
  ): Promise<void> {
    const conn = tx || this.db;
    await conn
      .update(schema.stories)
      .set(data)
      .where(eq(schema.stories.id, id));
  }

  async deleteStory(id: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.stories)
      .where(and(
        eq(schema.stories.id, id),
        eq(schema.stories.userId, userId)
      ));
  }

  // ── Story Requests ──

  async createRequest(data: schema.NewStoryRequest): Promise<schema.StoryRequest> {
    const [request] = await this.db
      .insert(schema.storyRequests)
      .values(data)
      .returning();
    return request;
  }

  async findRequestById(id: string): Promise<schema.StoryRequest | null> {
    const [request] = await this.db
      .select()
      .from(schema.storyRequests)
      .where(eq(schema.storyRequests.id, id))
      .limit(1);
    return request || null;
  }

  async findRequestByIdAndUser(id: string, userId: string): Promise<schema.StoryRequest | null> {
    const [request] = await this.db
      .select()
      .from(schema.storyRequests)
      .where(and(
        eq(schema.storyRequests.id, id),
        eq(schema.storyRequests.userId, userId)
      ))
      .limit(1);
    return request || null;
  }

  async updateRequest(
    id: string,
    data: Partial<schema.NewStoryRequest>,
    tx?: NodePgDatabase<typeof schema>
  ): Promise<void> {
    const conn = tx || this.db;
    await conn
      .update(schema.storyRequests)
      .set(data)
      .where(eq(schema.storyRequests.id, id));
  }

  /**
   * Lock and count active requests for a user (for concurrency limits).
   * Uses a subquery to avoid FOR UPDATE with aggregates.
   */
  async countActiveRequestsByUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.storyRequests)
      .where(
        and(
          eq(schema.storyRequests.userId, userId),
          inArray(schema.storyRequests.status, ['pending', 'processing'])
        )
      );
    return Number(result[0]?.count ?? 0);
  }

  /**
   * Lock and count active requests for a user (for concurrency limits).
   * Uses a subquery to avoid FOR UPDATE with aggregates.
   */
  async countActiveRequestsForUpdate(userId: string): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT COUNT(*)::int AS active_count
      FROM (
        SELECT id
        FROM ${schema.storyRequests}
        WHERE user_id = ${userId}
          AND status IN ('pending', 'processing')
        FOR UPDATE
      ) locked_rows
    `);
    return Number((result as any)[0]?.active_count ?? 0);
  }

  /**
   * Find request for update within a transaction (row-level lock).
   */
  async findRequestForUpdate(
    id: string,
    tx: NodePgDatabase<typeof schema>
  ): Promise<schema.StoryRequest | null> {
    const [request] = await (tx as any)
      .select()
      .from(schema.storyRequests)
      .where(eq(schema.storyRequests.id, id))
      .limit(1)
      .for('update');
    return request || null;
  }

  // ── Story Series ──

  async findSeriesById(id: string): Promise<schema.StorySeries | null> {
    const [series] = await this.db
      .select()
      .from(schema.storySeries)
      .where(eq(schema.storySeries.id, id))
      .limit(1);
    return series || null;
  }

  async createSeries(data: schema.NewStorySeries): Promise<schema.StorySeries> {
    const [series] = await this.db
      .insert(schema.storySeries)
      .values(data)
      .returning();
    return series;
  }

  async updateSeries(
    id: string,
    data: Partial<schema.NewStorySeries>
  ): Promise<void> {
    await this.db
      .update(schema.storySeries)
      .set(data)
      .where(eq(schema.storySeries.id, id));
  }

  async deleteSeries(id: string): Promise<void> {
    await this.db
      .delete(schema.storySeries)
      .where(eq(schema.storySeries.id, id));
  }

  // ── Story Characters ──

  async createStoryCharacters(
    data: schema.NewStoryCharacter[],
    tx?: NodePgDatabase<typeof schema>
  ): Promise<void> {
    if (data.length === 0) return;
    const conn = tx || this.db;
    await conn.insert(schema.storyCharacters).values(data);
  }

  async createStoryCharacter(
    data: schema.NewStoryCharacter,
    tx?: NodePgDatabase<typeof schema>
  ): Promise<void> {
    const conn = tx || this.db;
    await conn.insert(schema.storyCharacters).values(data);
  }

  async findLinkedCharactersByStoryId(storyId: string): Promise<Array<{
    id: string;
    name: string;
    type: string;
    role: string | null;
    isHidden: boolean;
    description: string | null;
    referencePhotos: unknown;
    turnaroundSheet: unknown;
  }>> {
    const rows = await this.db
      .select({
        id: schema.characters.id,
        name: schema.characters.name,
        type: schema.characters.type,
        role: schema.storyCharacters.role,
        isHidden: schema.characters.isHidden,
        description: schema.characters.description,
        referencePhotos: schema.characters.referencePhotos,
        turnaroundSheet: schema.characters.turnaroundSheet,
      })
      .from(schema.storyCharacters)
      .innerJoin(schema.characters, eq(schema.storyCharacters.characterId, schema.characters.id))
      .where(eq(schema.storyCharacters.storyId, storyId));
    return rows;
  }

  // ── Analytics queries ──

  /** Fetch recent stories with non-null metadata for generation time coefficients */
  async findRecentWithMetadata(limit: number): Promise<Array<{ metadata: unknown }>> {
    return this.db
      .select({
        metadata: schema.stories.metadata,
      })
      .from(schema.stories)
      .where(isNotNull(schema.stories.metadata))
      .orderBy(desc(schema.stories.createdAt))
      .limit(limit);
  }

  /** Fetch recent stories with audioMetadata for audio coefficient calculation */
  async findRecentWithAudioMetadata(limit: number): Promise<Array<{ audioMetadata: unknown; metadata: unknown }>> {
    return this.db
      .select({
        audioMetadata: schema.stories.audioMetadata,
        metadata: schema.stories.metadata,
      })
      .from(schema.stories)
      .where(isNotNull(schema.stories.audioMetadata))
      .orderBy(desc(schema.stories.createdAt))
      .limit(limit);
  }
}
