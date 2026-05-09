import { DEFAULT_LOCALE } from '@wondertales/shared';
import { desc, eq, ilike, inArray, sql } from 'drizzle-orm';
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
      preferredLocale: data.preferredLocale || DEFAULT_LOCALE,
    };
    const [user] = await this.db.insert(schema.users).values(newUser).returning();
    return user;
  }

  async update(
    id: string,
    data: Partial<Pick<schema.NewUser, 'displayName' | 'avatarUrl' | 'preferredLocale' | 'mode' | 'onboardingCompleted' | 'pseudonym' | 'aboutMe' | 'passwordHash' | 'stripeCustomerId' | 'themePalette' | 'childModeExitPasscodeHash' | 'childModeExitPasscodeSetAt' | 'status' | 'suspendedAt' | 'suspendedReason' | 'suspendedByUserId'>>
  ): Promise<schema.User> {
    const [user] = await this.db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async findPublicAuthorById(id: string): Promise<Pick<schema.User, 'id' | 'displayName' | 'pseudonym' | 'aboutMe' | 'avatarUrl'> | null> {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        displayName: schema.users.displayName,
        pseudonym: schema.users.pseudonym,
        aboutMe: schema.users.aboutMe,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return user || null;
  }

  async findPublicAuthorsByIds(ids: string[]): Promise<Array<Pick<schema.User, 'id' | 'displayName' | 'pseudonym' | 'aboutMe' | 'avatarUrl'>>> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: schema.users.id,
        displayName: schema.users.displayName,
        pseudonym: schema.users.pseudonym,
        aboutMe: schema.users.aboutMe,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, ids));
  }

  async updateRole(id: string, role: 'user' | 'admin'): Promise<schema.User> {
    const [user] = await this.db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async updateStatus(
    id: string,
    input: {
      status: 'active' | 'suspended';
      suspendedReason?: string | null;
      suspendedByUserId?: string | null;
    }
  ): Promise<schema.User> {
    const suspended = input.status === 'suspended';
    const [user] = await this.db
      .update(schema.users)
      .set({
        status: input.status,
        suspendedAt: suspended ? new Date() : null,
        suspendedReason: suspended ? input.suspendedReason ?? null : null,
        suspendedByUserId: suspended ? input.suspendedByUserId ?? null : null,
        updatedAt: new Date(),
      })
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
    status: string;
    suspendedAt: Date | null;
    suspendedReason: string | null;
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
        status: schema.users.status,
        suspendedAt: schema.users.suspendedAt,
        suspendedReason: schema.users.suspendedReason,
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
