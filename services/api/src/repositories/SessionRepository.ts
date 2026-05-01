import { eq, and, lt, gt, desc, isNull, or } from 'drizzle-orm';
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
          gt(schema.sessions.expiresAt, new Date()),
          isNull(schema.sessions.revokedAt)
        )
      )
      .limit(1);
    return session || null;
  }

  async findValidByIdWithUser(
    sessionId: string
  ): Promise<{ session: schema.Session; user: schema.User } | null> {
    // First, find the valid session
    const [session] = await this.db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.id, sessionId),
          gt(schema.sessions.expiresAt, new Date()),
          isNull(schema.sessions.revokedAt)
        )
      )
      .limit(1);
    
    if (!session) return null;
    
    // Then, fetch the associated user
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);
    
    if (!user) return null;
    
    return { session, user };
  }

  async findByUserId(userId: string): Promise<schema.Session[]> {
    return this.db
      .select()
      .from(schema.sessions)
      .where(and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt)
      ))
      .orderBy(desc(schema.sessions.lastActiveAt));
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
      .where(or(
        eq(schema.sessions.token, token),
        eq(schema.sessions.id, token)
      ));
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
