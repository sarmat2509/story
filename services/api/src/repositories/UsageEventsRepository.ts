/**
 * UsageEventsRepository - Product usage tracking for entitlements
 * Records story_created, image_generated, audio_synthesized, plan_upgraded events.
 */

import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface CreateUsageEventInput {
  userId: string;
  childProfileId?: string | null;
  eventType: string;
  resourceType: string;
  quantity?: number;
  metadata?: Record<string, unknown> | null;
}

export class UsageEventsRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(input: CreateUsageEventInput): Promise<schema.UsageEvent> {
    const [row] = await this.db
      .insert(schema.usageEvents)
      .values({
        userId: input.userId,
        childProfileId: input.childProfileId ?? null,
        eventType: input.eventType,
        resourceType: input.resourceType,
        quantity: input.quantity ?? 1,
        metadata: input.metadata ?? null,
      })
      .returning();
    if (!row) throw new Error('Failed to create usage_event');
    return row;
  }

  /**
   * Get total quantity for a user in a date range, optionally filtered by event type.
   */
  async getUsageForPeriod(
    userId: string,
    startDate: Date,
    endDate: Date,
    eventType?: string,
    childProfileId?: string | null
  ): Promise<number> {
    const conditions = [
      eq(schema.usageEvents.userId, userId),
      gte(schema.usageEvents.createdAt, startDate),
      lt(schema.usageEvents.createdAt, endDate),
    ];
    if (eventType) {
      conditions.push(eq(schema.usageEvents.eventType, eventType));
    }
    if (childProfileId !== undefined) {
      conditions.push(
        childProfileId === null
          ? sql`${schema.usageEvents.childProfileId} IS NULL`
          : eq(schema.usageEvents.childProfileId, childProfileId)
      );
    }

    const [row] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(and(...conditions));
    return Number(row?.total ?? 0);
  }

  /**
   * Sum audio_synthesized quantity for one story in a billing window (metadata.storyId).
   * Used to bill at most once per story per period — regenerations should not inflate usage.
   */
  async sumAudioSynthesizedForStoryInPeriod(
    userId: string,
    storyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.usageEvents.quantity}), 0)::integer`,
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.userId, userId),
          eq(schema.usageEvents.eventType, 'audio_synthesized'),
          gte(schema.usageEvents.createdAt, startDate),
          lt(schema.usageEvents.createdAt, endDate),
          sql`(${schema.usageEvents.metadata}->>'storyId') = ${storyId}`
        )
      );
    return Number(row?.total ?? 0);
  }
}
