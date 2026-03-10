import type { StoryAudioMetadata } from '@wondertales/shared';
import { eq, and, desc, asc, sql, isNotNull, inArray, gte, lte } from 'drizzle-orm';
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

  async findByShareToken(token: string): Promise<schema.Story | null> {
    const [story] = await this.db
      .select()
      .from(schema.stories)
      .where(and(
        eq(schema.stories.shareToken, token),
        eq(schema.stories.isPublished, true)
      ))
      .limit(1);
    return story || null;
  }

  async listPublished(options: {
    limit?: number;
    offset?: number;
    hasAudio?: boolean;
    scenarioCardId?: string;
  } = {}): Promise<schema.Story[]> {
    const { limit = 20, offset = 0, hasAudio, scenarioCardId } = options;
    const conditions = [
      eq(schema.stories.isPublished, true),
      isNotNull(schema.stories.publishedSlug),
    ];
    if (hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (scenarioCardId) {
      const rows = await this.db
        .select({ story: schema.stories, scenarioCardId: schema.storyRequests.scenarioCardId })
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions, eq(schema.storyRequests.scenarioCardId, scenarioCardId)))
        .orderBy(desc(schema.stories.publishedAt))
        .limit(limit)
        .offset(offset);
      return rows.map(r => ({ ...r.story, scenarioCardId: r.scenarioCardId }));
    }
    const rows = await this.db
      .select({ story: schema.stories, scenarioCardId: schema.storyRequests.scenarioCardId })
      .from(schema.stories)
      .leftJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
      .where(and(...conditions))
      .orderBy(desc(schema.stories.publishedAt))
      .limit(limit)
      .offset(offset);
    return rows.map(r => ({ ...r.story, scenarioCardId: r.scenarioCardId ?? null }));
  }

  async countPublished(options: { hasAudio?: boolean; scenarioCardId?: string } = {}): Promise<number> {
    const { hasAudio, scenarioCardId } = options;
    const conditions = [
      eq(schema.stories.isPublished, true),
      isNotNull(schema.stories.publishedSlug),
    ];
    if (hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (scenarioCardId) {
      const result = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions, eq(schema.storyRequests.scenarioCardId, scenarioCardId)));
      return Number(result[0]?.count ?? 0);
    }
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.stories)
      .where(and(...conditions));
    return Number(result[0]?.count ?? 0);
  }

  async countPublishedByUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.stories)
      .where(and(
        eq(schema.stories.userId, userId),
        eq(schema.stories.isPublished, true)
      ));
    return Number(result[0]?.count ?? 0);
  }

  async countAudioStoriesByUserInPeriod(userId: string, periodStart: Date): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.stories)
      .where(and(
        eq(schema.stories.userId, userId),
        isNotNull(schema.stories.audioMetadata),
        gte(schema.stories.createdAt, periodStart)
      ));
    return Number(result[0]?.count ?? 0);
  }

  async findByUser(
    userId: string,
    options: { limit?: number; offset?: number; hasAudio?: boolean; scenarioCardId?: string; seriesId?: string } = {}
  ): Promise<schema.Story[]> {
    const { limit = 20, offset = 0, hasAudio, scenarioCardId, seriesId } = options;
    const conditions = [
      eq(schema.stories.userId, userId),
      eq(schema.stories.hidden, false),
    ];
    if (hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (seriesId) {
      conditions.push(eq(schema.stories.seriesId, seriesId));
    }
    const orderBy = seriesId ? asc(schema.stories.partNumber) : desc(schema.stories.createdAt);
    if (scenarioCardId) {
      conditions.push(eq(schema.storyRequests.scenarioCardId, scenarioCardId));
      const rows = await this.db
        .select({ story: schema.stories })
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
      return rows.map(r => r.story);
    }
    return this.db
      .select()
      .from(schema.stories)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);
  }

  async findSummariesByUser(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      hasAudio?: boolean;
      scenarioCardId?: string;
      seriesId?: string;
    } = {}
  ): Promise<Array<{
    id: string;
    title: string;
    language: string;
    isPublished: boolean | null;
    audioMetadata: StoryAudioMetadata | null;
    scenes: unknown;
    createdAt: Date;
    scenarioCardId: string | null;
    partNumber: number | null;
  }>> {
    const { limit = 20, offset = 0, hasAudio, scenarioCardId, seriesId } = options;
    const conditions = [
      eq(schema.stories.userId, userId),
      eq(schema.stories.hidden, false),
    ];
    if (hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (seriesId) {
      conditions.push(eq(schema.stories.seriesId, seriesId));
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
      partNumber: schema.stories.partNumber,
    };
    const orderBy = seriesId
      ? asc(schema.stories.partNumber)
      : desc(schema.stories.createdAt);
    if (scenarioCardId) {
      conditions.push(eq(schema.storyRequests.scenarioCardId, scenarioCardId));
      return this.db
        .select(selectFields)
        .from(schema.stories)
        .innerJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    }
    return this.db
      .select(selectFields)
      .from(schema.stories)
      .leftJoin(schema.storyRequests, eq(schema.stories.storyRequestId, schema.storyRequests.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);
  }

  async countByUser(
    userId: string,
    options: { hasAudio?: boolean; scenarioCardId?: string; seriesId?: string } = {}
  ): Promise<number> {
    const conditions = [
      eq(schema.stories.userId, userId),
      eq(schema.stories.hidden, false),
    ];
    if (options.hasAudio) {
      conditions.push(isNotNull(schema.stories.audioMetadata));
    }
    if (options.seriesId) {
      conditions.push(eq(schema.stories.seriesId, options.seriesId));
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

  /** Increment public_render_version (for SSR cache invalidation on audio/alignment/publish) */
  async incrementPublicRenderVersion(id: string): Promise<void> {
    await this.db
      .update(schema.stories)
      .set({
        publicRenderVersion: sql`COALESCE(${schema.stories.publicRenderVersion}, 1) + 1`,
        updatedAt: new Date(),
      })
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

  async findSeriesByUserId(userId: string): Promise<schema.StorySeries[]> {
    return this.db
      .select()
      .from(schema.storySeries)
      .where(eq(schema.storySeries.userId, userId))
      .orderBy(desc(schema.storySeries.createdAt));
  }

  async findStoriesByIdsWithScenes(ids: string[]): Promise<Array<{ id: string; scenes: unknown }>> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: schema.stories.id, scenes: schema.stories.scenes })
      .from(schema.stories)
      .where(inArray(schema.stories.id, ids));
    return rows;
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
  async findRecentWithAudioMetadata(limit: number): Promise<Array<{ audioMetadata: StoryAudioMetadata | null; metadata: unknown }>> {
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

  /** Insert story into batch_image_pending for scheduled continuation batch image processing */
  async insertBatchImagePending(params: {
    storyId: string;
    requestId: string;
    scheduleId?: string | null;
  }): Promise<void> {
    await this.db.insert(schema.batchImagePending).values({
      storyId: params.storyId,
      requestId: params.requestId,
      scheduleId: params.scheduleId ?? null,
    });
  }

  /** Find all batch_image_pending rows (for batch worker) */
  async findBatchImagePendingAll(): Promise<schema.BatchImagePending[]> {
    return this.db.select().from(schema.batchImagePending).orderBy(schema.batchImagePending.createdAt);
  }

  /** Delete batch_image_pending by id (after processing) */
  async deleteBatchImagePendingById(id: string): Promise<void> {
    await this.db.delete(schema.batchImagePending).where(eq(schema.batchImagePending.id, id));
  }

  /** Create batch_image_jobs row */
  async createBatchImageJob(params: {
    batchId: string;
    vendor: string;
    status: string;
    pendingIds: string[];
  }): Promise<schema.BatchImageJob> {
    const [job] = await this.db
      .insert(schema.batchImageJobs)
      .values({
        batchId: params.batchId,
        vendor: params.vendor,
        status: params.status,
        pendingIds: params.pendingIds,
      })
      .returning();
    return job;
  }

  /** Find batch_image_jobs by batchId */
  async findBatchImageJobByBatchId(batchId: string): Promise<schema.BatchImageJob | null> {
    const [job] = await this.db
      .select()
      .from(schema.batchImageJobs)
      .where(eq(schema.batchImageJobs.batchId, batchId))
      .limit(1);
    return job || null;
  }

  /** Find batch_image_jobs by status */
  async findBatchImageJobsByStatus(status: string): Promise<schema.BatchImageJob[]> {
    return this.db
      .select()
      .from(schema.batchImageJobs)
      .where(eq(schema.batchImageJobs.status, status));
  }

  /** Update batch_image_jobs status */
  async updateBatchImageJobStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(schema.batchImageJobs)
      .set({ status })
      .where(eq(schema.batchImageJobs.id, id));
  }

  /** Find batch_image_pending by id */
  async findBatchImagePendingById(id: string): Promise<schema.BatchImagePending | null> {
    const [row] = await this.db
      .select()
      .from(schema.batchImagePending)
      .where(eq(schema.batchImagePending.id, id))
      .limit(1);
    return row || null;
  }

  /** Find series_schedule by seriesId */
  async findScheduleBySeriesId(seriesId: string): Promise<schema.SeriesSchedule | null> {
    const [row] = await this.db
      .select()
      .from(schema.seriesSchedules)
      .where(eq(schema.seriesSchedules.seriesId, seriesId))
      .limit(1);
    return row || null;
  }

  /** Create or replace series_schedule (upsert by seriesId) */
  async upsertSeriesSchedule(params: {
    seriesId: string;
    userId: string;
    cadence: string;
    runAtTime: string;
    nextRunAt: Date;
  }): Promise<schema.SeriesSchedule> {
    const existing = await this.findScheduleBySeriesId(params.seriesId);
    if (existing) {
      await this.db
        .update(schema.seriesSchedules)
        .set({
          cadence: params.cadence,
          runAtTime: params.runAtTime,
          nextRunAt: params.nextRunAt,
        })
        .where(eq(schema.seriesSchedules.id, existing.id));
      const [updated] = await this.db
        .select()
        .from(schema.seriesSchedules)
        .where(eq(schema.seriesSchedules.id, existing.id))
        .limit(1);
      return updated!;
    }
    const [created] = await this.db
      .insert(schema.seriesSchedules)
      .values({
        seriesId: params.seriesId,
        userId: params.userId,
        cadence: params.cadence,
        runAtTime: params.runAtTime,
        nextRunAt: params.nextRunAt,
      })
      .returning();
    return created!;
  }

  /** Delete series_schedule by seriesId */
  async deleteScheduleBySeriesId(seriesId: string): Promise<void> {
    await this.db
      .delete(schema.seriesSchedules)
      .where(eq(schema.seriesSchedules.seriesId, seriesId));
  }

  /** Check if story has pending batch_image_pending for its series */
  async hasPendingBatchForSeries(seriesId: string): Promise<boolean> {
    const series = await this.findSeriesById(seriesId);
    if (!series?.storyIds?.length) return false;
    const storyIds = series.storyIds as string[];
    const rows = await this.db
      .select({ id: schema.batchImagePending.id })
      .from(schema.batchImagePending)
      .where(inArray(schema.batchImagePending.storyId, storyIds))
      .limit(1);
    return rows.length > 0;
  }

  /** Find due series_schedules (next_run_at <= now) */
  async findDueSeriesSchedules(now: Date): Promise<schema.SeriesSchedule[]> {
    return this.db
      .select()
      .from(schema.seriesSchedules)
      .where(lte(schema.seriesSchedules.nextRunAt, now))
      .orderBy(schema.seriesSchedules.nextRunAt);
  }

  /** Update series_schedules next_run_at by cadence */
  async updateScheduleNextRunAt(
    scheduleId: string,
    nextRunAt: Date
  ): Promise<void> {
    await this.db
      .update(schema.seriesSchedules)
      .set({ nextRunAt })
      .where(eq(schema.seriesSchedules.id, scheduleId));
  }

  /** Find batch_image_pending by id with story and request */
  async findBatchImagePendingWithDetails(id: string): Promise<{
    pending: schema.BatchImagePending;
    story: schema.Story;
    request: schema.StoryRequest;
  } | null> {
    const rows = await this.db
      .select({
        pending: schema.batchImagePending,
        story: schema.stories,
        request: schema.storyRequests,
      })
      .from(schema.batchImagePending)
      .innerJoin(schema.stories, eq(schema.batchImagePending.storyId, schema.stories.id))
      .innerJoin(schema.storyRequests, eq(schema.batchImagePending.requestId, schema.storyRequests.id))
      .where(eq(schema.batchImagePending.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { pending: row.pending, story: row.story, request: row.request };
  }
}
