import { and, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class FeedbackRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async listAllPaginated(options: {
    limit: number;
    offset: number;
    search?: string;
    category?: string;
    hasScreenshot?: boolean;
  }): Promise<
    Array<{
      id: string;
      userId: string | null;
      userEmail: string | null;
      category: string;
      message: string;
      email: string | null;
      screenshotUrl: string | null;
      context: unknown;
      createdAt: Date;
    }>
  > {
    const { limit, offset, search, category, hasScreenshot } = options;
    const normalizedSearch = search?.trim();
    const normalizedCategory = category?.trim();
    const filters = [];

    if (normalizedSearch) {
      filters.push(
        or(
          ilike(schema.userFeedback.message, `%${normalizedSearch}%`),
          ilike(schema.userFeedback.category, `%${normalizedSearch}%`),
          ilike(schema.userFeedback.email, `%${normalizedSearch}%`),
          ilike(schema.users.email, `%${normalizedSearch}%`),
          sql`CAST(${schema.userFeedback.context} AS text) ILIKE ${`%${normalizedSearch}%`}`,
        ),
      );
    }
    if (normalizedCategory) {
      filters.push(eq(schema.userFeedback.category, normalizedCategory));
    }
    if (hasScreenshot) {
      filters.push(and(isNotNull(schema.userFeedback.screenshotUrl), sql`length(trim(${schema.userFeedback.screenshotUrl})) > 0`));
    }

    const query = this.db
      .select({
        id: schema.userFeedback.id,
        userId: schema.userFeedback.userId,
        userEmail: schema.users.email,
        category: schema.userFeedback.category,
        message: schema.userFeedback.message,
        email: schema.userFeedback.email,
        screenshotUrl: schema.userFeedback.screenshotUrl,
        context: schema.userFeedback.context,
        createdAt: schema.userFeedback.createdAt,
      })
      .from(schema.userFeedback)
      .leftJoin(schema.users, eq(schema.users.id, schema.userFeedback.userId))
      .orderBy(desc(schema.userFeedback.createdAt))
      .limit(limit)
      .offset(offset);

    if (filters.length === 0) {
      return query;
    }

    return query.where(and(...filters));
  }

  async countAll(search?: string, category?: string, hasScreenshot?: boolean): Promise<number> {
    const normalizedSearch = search?.trim();
    const normalizedCategory = category?.trim();
    const filters = [];
    const baseQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.userFeedback)
      .leftJoin(schema.users, eq(schema.users.id, schema.userFeedback.userId));

    if (normalizedSearch) {
      filters.push(
        or(
          ilike(schema.userFeedback.message, `%${normalizedSearch}%`),
          ilike(schema.userFeedback.category, `%${normalizedSearch}%`),
          ilike(schema.userFeedback.email, `%${normalizedSearch}%`),
          ilike(schema.users.email, `%${normalizedSearch}%`),
          sql`CAST(${schema.userFeedback.context} AS text) ILIKE ${`%${normalizedSearch}%`}`,
        ),
      );
    }
    if (normalizedCategory) {
      filters.push(eq(schema.userFeedback.category, normalizedCategory));
    }
    if (hasScreenshot) {
      filters.push(and(isNotNull(schema.userFeedback.screenshotUrl), sql`length(trim(${schema.userFeedback.screenshotUrl})) > 0`));
    }

    if (filters.length === 0) {
      const [row] = await baseQuery;
      return Number(row?.count ?? 0);
    }

    const [row] = await baseQuery.where(and(...filters));
    return Number(row?.count ?? 0);
  }
}
