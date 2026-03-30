import { desc, eq, ilike, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class UserRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findById(id: string): Promise<schema.User | null> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return user || null;
  }

  async findByEmail(email: string): Promise<schema.User | null> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return user || null;
  }

  async create(data: {
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    preferredLocale?: string;
  }): Promise<schema.User> {
    const newUser: schema.NewUser = {
      email: data.email,
      passwordHash: data.passwordHash ?? null,
      displayName: data.displayName || null,
      avatarUrl: data.avatarUrl || null,
      preferredLocale: data.preferredLocale || 'uk',
    };
    const [user] = await this.db.insert(schema.users).values(newUser).returning();
    return user;
  }

  async update(
    id: string,
    data: Partial<Pick<schema.NewUser, 'displayName' | 'avatarUrl' | 'preferredLocale' | 'mode' | 'pseudonym' | 'passwordHash' | 'stripeCustomerId'>>
  ): Promise<schema.User> {
    const [user] = await this.db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async updateRole(id: string, role: 'user' | 'admin'): Promise<schema.User> {
    const [user] = await this.db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }

  async listAllPaginated(options: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<Array<{
    id: string;
    email: string;
    role: string;
    createdAt: Date;
    planSlug: string | null;
    planName: string | null;
  }>> {
    const { limit, offset, search } = options;
    const normalizedSearch = search?.trim();

    const query = this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
        planSlug: schema.plans.slug,
        planName: schema.plans.name,
      })
      .from(schema.users)
      .leftJoin(schema.userSubscriptions, eq(schema.userSubscriptions.userId, schema.users.id))
      .leftJoin(schema.plans, eq(schema.plans.id, schema.userSubscriptions.planId))
      .orderBy(desc(schema.users.createdAt))
      .limit(limit)
      .offset(offset);

    if (normalizedSearch) {
      return query.where(ilike(schema.users.email, `%${normalizedSearch}%`));
    }

    return query;
  }

  async countAll(search?: string): Promise<number> {
    const normalizedSearch = search?.trim();
    const query = this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.users);

    if (normalizedSearch) {
      const [row] = await query.where(ilike(schema.users.email, `%${normalizedSearch}%`));
      return Number(row?.count ?? 0);
    }

    const [row] = await query;
    return Number(row?.count ?? 0);
  }
}
