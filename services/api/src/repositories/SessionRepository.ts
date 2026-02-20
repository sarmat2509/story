import { eq, and, lt, gt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class SessionRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(data: schema.NewSession): Promise<schema.Session> {
    const [session] = await this.db
      .insert(schema.sessions)
      .values(data)
      .returning();
    return session;
  }

  async findByToken(token: string): Promise<schema.Session | null> {
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, token))
      .limit(1);
    return session || null;
  }

  async findValidByToken(token: string): Promise<schema.Session | null> {
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.token, token),
          gt(schema.sessions.expiresAt, new Date())
        )
      )
      .limit(1);
    return session || null;
  }

  async findValidByIdWithUser(
    sessionId: string
  ): Promise<{ session: schema.Session; user: schema.User } | null> {
    const [result] = await this.db
      .select({
        session: schema.sessions,
        user: schema.users,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(
        and(
          eq(schema.sessions.id, sessionId),
          gt(schema.sessions.expiresAt, new Date())
        )
      )
      .limit(1);
    return result || null;
  }

  async findByUserId(userId: string): Promise<schema.Session[]> {
    return this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
      .orderBy(schema.sessions.lastActiveAt);
  }

  async updateLastActive(token: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(schema.sessions.token, token));
  }

  async deleteByToken(token: string): Promise<void> {
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.token, token));
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    return result.rowCount || 0;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()));
    return result.rowCount || 0;
  }
}
