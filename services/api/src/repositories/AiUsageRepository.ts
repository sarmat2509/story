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

  async getStoryCostBreakdown(storyId: string): Promise<Array<{ provider: string; operation: string; model: string | null; costUsd: number }>> {
    const rows = await this.db
      .select({
        provider: schema.aiUsageEvents.provider,
        operation: schema.aiUsageEvents.operation,
        model: schema.aiUsageEvents.model,
        costUsd: schema.aiUsageEvents.costUsd,
      })
      .from(schema.aiUsageEvents)
      .where(eq(schema.aiUsageEvents.storyId, storyId));
    return rows.map((r) => ({
      provider: r.provider,
      operation: r.operation,
      model: r.model,
      costUsd: r.costUsd != null ? Number(r.costUsd) : 0,
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
