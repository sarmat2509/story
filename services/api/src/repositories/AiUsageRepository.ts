/**
 * AiUsageRepository - AI cost tracking per call
 * Stores usage events for text, image, and audio providers.
 */

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface CreateAiUsageEventInput {
  userId?: string | null;
  storyId?: string | null;
  characterId?: string | null;
  childProfileId?: string | null;
  provider: string;
  operation: string;
  model?: string | null;
  inputUnits?: number | null;
  outputUnits?: number | null;
  costUsd?: number | string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface MatchedImageValidationUsage {
  provider: string;
  operation: string;
  model: string | null;
  inputUnits: number | null;
  outputUnits: number | null;
  costUsd: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  matchedDeltaMs: number;
}

export class AiUsageRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(input: CreateAiUsageEventInput): Promise<schema.AiUsageEvent> {
    const [row] = await this.db
      .insert(schema.aiUsageEvents)
      .values({
        userId: input.userId ?? null,
        storyId: input.storyId ?? null,
        characterId: input.characterId ?? null,
        childProfileId: input.childProfileId ?? null,
        provider: input.provider,
        operation: input.operation,
        model: input.model ?? null,
        inputUnits: input.inputUnits ?? null,
        outputUnits: input.outputUnits ?? null,
        costUsd: input.costUsd != null ? String(input.costUsd) : null,
        durationMs: input.durationMs ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();
    if (!row) throw new Error('Failed to create ai_usage_event');
    return row;
  }

  async getStoryCost(storyId: string): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.aiUsageEvents.costUsd}), 0)::numeric`,
      })
      .from(schema.aiUsageEvents)
      .where(eq(schema.aiUsageEvents.storyId, storyId));
    return Number(row?.total ?? 0);
  }

  async getStoryCostBreakdown(storyId: string): Promise<Array<{ provider: string; operation: string; model: string | null; costUsd: number; createdAt: Date }>> {
    const rows = await this.db
      .select({
        provider: schema.aiUsageEvents.provider,
        operation: schema.aiUsageEvents.operation,
        model: schema.aiUsageEvents.model,
        costUsd: schema.aiUsageEvents.costUsd,
        createdAt: schema.aiUsageEvents.createdAt,
      })
      .from(schema.aiUsageEvents)
      .where(eq(schema.aiUsageEvents.storyId, storyId));
    return rows.map((r) => ({
      provider: r.provider,
      operation: r.operation,
      model: r.model,
      costUsd: r.costUsd != null ? Number(r.costUsd) : 0,
      createdAt: r.createdAt,
    }));
  }

  async listByStoryId(storyId: string): Promise<Array<{
    provider: string;
    operation: string;
    model: string | null;
    inputUnits: number | null;
    outputUnits: number | null;
    durationMs: number | null;
    metadata: Record<string, unknown> | null;
    costUsd: number | null;
    createdAt: Date;
  }>> {
    const rows = await this.db
      .select({
        provider: schema.aiUsageEvents.provider,
        operation: schema.aiUsageEvents.operation,
        model: schema.aiUsageEvents.model,
        inputUnits: schema.aiUsageEvents.inputUnits,
        outputUnits: schema.aiUsageEvents.outputUnits,
        durationMs: schema.aiUsageEvents.durationMs,
        metadata: schema.aiUsageEvents.metadata,
        costUsd: schema.aiUsageEvents.costUsd,
        createdAt: schema.aiUsageEvents.createdAt,
      })
      .from(schema.aiUsageEvents)
      .where(eq(schema.aiUsageEvents.storyId, storyId));
    return rows.map((row) => ({
      provider: row.provider,
      operation: row.operation,
      model: row.model,
      inputUnits: row.inputUnits,
      outputUnits: row.outputUnits,
      durationMs: row.durationMs,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      costUsd: row.costUsd != null ? Number(row.costUsd) : null,
      createdAt: row.createdAt,
    }));
  }

  async findNearestImageValidationUsage(params: {
    storyId: string;
    model?: string | null;
    createdAt: Date;
    windowSeconds?: number;
  }): Promise<MatchedImageValidationUsage | null> {
    const windowSeconds = params.windowSeconds ?? 60;
    const createdAtUtc = sql`${schema.aiUsageEvents.createdAt} AT TIME ZONE 'UTC'`;
    const deltaSeconds = sql<number>`ABS(EXTRACT(EPOCH FROM (${createdAtUtc} - ${params.createdAt})))`;
    const conditions = [
      eq(schema.aiUsageEvents.storyId, params.storyId),
      sql`${schema.aiUsageEvents.operation} LIKE 'image_validation%'`,
      sql`${deltaSeconds} <= ${windowSeconds}`,
    ];

    if (params.model) {
      conditions.push(eq(schema.aiUsageEvents.model, params.model));
    }

    const [row] = await this.db
      .select({
        provider: schema.aiUsageEvents.provider,
        operation: schema.aiUsageEvents.operation,
        model: schema.aiUsageEvents.model,
        inputUnits: schema.aiUsageEvents.inputUnits,
        outputUnits: schema.aiUsageEvents.outputUnits,
        costUsd: schema.aiUsageEvents.costUsd,
        durationMs: schema.aiUsageEvents.durationMs,
        metadata: schema.aiUsageEvents.metadata,
        createdAt: schema.aiUsageEvents.createdAt,
        deltaMs: sql<number>`${deltaSeconds} * 1000`,
      })
      .from(schema.aiUsageEvents)
      .where(and(...conditions))
      .orderBy(deltaSeconds)
      .limit(1);

    if (!row) return null;
    return {
      provider: row.provider,
      operation: row.operation,
      model: row.model,
      inputUnits: row.inputUnits,
      outputUnits: row.outputUnits,
      costUsd: row.costUsd != null ? Number(row.costUsd) : null,
      durationMs: row.durationMs,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
      matchedDeltaMs: Math.round(Number(row.deltaMs ?? 0)),
    };
  }

  async listImageValidationUsageCandidates(params: {
    storyId: string;
    model?: string | null;
    createdAt: Date;
    windowSeconds?: number;
  }): Promise<MatchedImageValidationUsage[]> {
    const windowSeconds = params.windowSeconds ?? 300;
    const createdAtUtc = sql`${schema.aiUsageEvents.createdAt} AT TIME ZONE 'UTC'`;
    const deltaSeconds = sql<number>`ABS(EXTRACT(EPOCH FROM (${createdAtUtc} - ${params.createdAt})))`;
    const conditions = [
      eq(schema.aiUsageEvents.storyId, params.storyId),
      sql`${schema.aiUsageEvents.operation} LIKE 'image_validation%'`,
      sql`${deltaSeconds} <= ${windowSeconds}`,
    ];

    if (params.model) {
      conditions.push(eq(schema.aiUsageEvents.model, params.model));
    }

    const rows = await this.db
      .select({
        provider: schema.aiUsageEvents.provider,
        operation: schema.aiUsageEvents.operation,
        model: schema.aiUsageEvents.model,
        inputUnits: schema.aiUsageEvents.inputUnits,
        outputUnits: schema.aiUsageEvents.outputUnits,
        costUsd: schema.aiUsageEvents.costUsd,
        durationMs: schema.aiUsageEvents.durationMs,
        metadata: schema.aiUsageEvents.metadata,
        createdAt: schema.aiUsageEvents.createdAt,
        deltaMs: sql<number>`${deltaSeconds} * 1000`,
      })
      .from(schema.aiUsageEvents)
      .where(and(...conditions))
      .orderBy(schema.aiUsageEvents.createdAt);

    return rows.map((row) => ({
      provider: row.provider,
      operation: row.operation,
      model: row.model,
      inputUnits: row.inputUnits,
      outputUnits: row.outputUnits,
      costUsd: row.costUsd != null ? Number(row.costUsd) : null,
      durationMs: row.durationMs,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
      matchedDeltaMs: Math.round(Number(row.deltaMs ?? 0)),
    }));
  }

  async getUserMonthlyCost(userId: string, year: number, month: number): Promise<number> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const [row] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.aiUsageEvents.costUsd}), 0)::numeric`,
      })
      .from(schema.aiUsageEvents)
      .where(
        and(
          eq(schema.aiUsageEvents.userId, userId),
          gte(schema.aiUsageEvents.createdAt, startOfMonth),
          lte(schema.aiUsageEvents.createdAt, endOfMonth)
        )
      );
    return Number(row?.total ?? 0);
  }
}
