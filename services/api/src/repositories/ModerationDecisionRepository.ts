import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface ListModerationDecisionEventsParams {
  limit: number;
  offset: number;
  decision?: string;
  stage?: string;
  userId?: string;
  storyId?: string;
}

export class ModerationDecisionRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(data: schema.NewModerationDecisionEvent): Promise<schema.ModerationDecisionEvent> {
    const [event] = await this.db
      .insert(schema.moderationDecisionEvents)
      .values(data)
      .returning();
    return event;
  }

  async listRecent(
    params: ListModerationDecisionEventsParams
  ): Promise<schema.ModerationDecisionEvent[]> {
    return this.db
      .select()
      .from(schema.moderationDecisionEvents)
      .where(this.buildFilters(params))
      .orderBy(desc(schema.moderationDecisionEvents.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countRecent(params: ListModerationDecisionEventsParams): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.moderationDecisionEvents)
      .where(this.buildFilters(params));
    return Number(row?.value ?? 0);
  }

  private buildFilters(params: ListModerationDecisionEventsParams): SQL<unknown> | undefined {
    const filters: SQL<unknown>[] = [];
    if (params.decision) {
      filters.push(eq(schema.moderationDecisionEvents.decision, params.decision));
    }
    if (params.stage) {
      filters.push(eq(schema.moderationDecisionEvents.stage, params.stage));
    }
    if (params.userId) {
      filters.push(eq(schema.moderationDecisionEvents.userId, params.userId));
    }
    if (params.storyId) {
      filters.push(eq(schema.moderationDecisionEvents.storyId, params.storyId));
    }
    return filters.length > 0 ? and(...filters) : undefined;
  }
}
