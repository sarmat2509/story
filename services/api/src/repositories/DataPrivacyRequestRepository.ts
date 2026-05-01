import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface ListDataPrivacyRequestsOptions {
  limit: number;
  offset: number;
  requestType?: string;
  status?: string;
  search?: string;
}

export class DataPrivacyRequestRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(data: {
    userId: string;
    requesterEmail?: string | null;
    requestType: string;
    message?: string | null;
  }): Promise<schema.DataPrivacyRequest> {
    const [request] = await this.db
      .insert(schema.dataPrivacyRequests)
      .values({
        userId: data.userId,
        requesterEmail: data.requesterEmail ?? null,
        requestType: data.requestType,
        message: data.message ?? null,
        status: 'open',
      })
      .returning();
    return request;
  }

  async findById(id: string): Promise<schema.DataPrivacyRequest | null> {
    const [request] = await this.db
      .select()
      .from(schema.dataPrivacyRequests)
      .where(eq(schema.dataPrivacyRequests.id, id))
      .limit(1);
    return request || null;
  }

  async listForUser(userId: string): Promise<schema.DataPrivacyRequest[]> {
    return this.db
      .select()
      .from(schema.dataPrivacyRequests)
      .where(eq(schema.dataPrivacyRequests.userId, userId))
      .orderBy(desc(schema.dataPrivacyRequests.createdAt));
  }

  async listAllPaginated(options: ListDataPrivacyRequestsOptions): Promise<schema.DataPrivacyRequest[]> {
    const { limit, offset } = options;
    const filters = this.buildFilters(options);
    const query = this.db
      .select()
      .from(schema.dataPrivacyRequests)
      .orderBy(desc(schema.dataPrivacyRequests.createdAt))
      .limit(limit)
      .offset(offset);

    if (filters.length === 0) {
      return query;
    }

    return query.where(and(...filters));
  }

  async countAll(options: Omit<ListDataPrivacyRequestsOptions, 'limit' | 'offset'> = {}): Promise<number> {
    const filters = this.buildFilters(options);
    const query = this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.dataPrivacyRequests);

    if (filters.length === 0) {
      const [row] = await query;
      return Number(row?.count ?? 0);
    }

    const [row] = await query.where(and(...filters));
    return Number(row?.count ?? 0);
  }

  async updateReview(data: {
    id: string;
    status: string;
    adminNotes?: string | null;
    reviewedByUserId: string;
  }): Promise<schema.DataPrivacyRequest | null> {
    const now = new Date();
    const [request] = await this.db
      .update(schema.dataPrivacyRequests)
      .set({
        status: data.status,
        adminNotes: data.adminNotes ?? null,
        reviewedByUserId: data.reviewedByUserId,
        reviewedAt: now,
        fulfilledAt: data.status === 'fulfilled' ? now : null,
        updatedAt: now,
      })
      .where(eq(schema.dataPrivacyRequests.id, data.id))
      .returning();
    return request || null;
  }

  private buildFilters(options: {
    requestType?: string;
    status?: string;
    search?: string;
  }) {
    const filters = [];
    const requestType = options.requestType?.trim();
    const status = options.status?.trim();
    const search = options.search?.trim();

    if (requestType) {
      filters.push(eq(schema.dataPrivacyRequests.requestType, requestType));
    }
    if (status) {
      filters.push(eq(schema.dataPrivacyRequests.status, status));
    }
    if (search) {
      filters.push(
        or(
          ilike(schema.dataPrivacyRequests.requesterEmail, `%${search}%`),
          ilike(schema.dataPrivacyRequests.message, `%${search}%`),
          ilike(schema.dataPrivacyRequests.adminNotes, `%${search}%`),
        )
      );
    }

    return filters;
  }
}
