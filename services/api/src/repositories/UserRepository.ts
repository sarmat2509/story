import { eq } from 'drizzle-orm';
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
    displayName?: string | null;
    avatarUrl?: string | null;
    preferredLocale?: string;
  }): Promise<schema.User> {
    const newUser: schema.NewUser = {
      email: data.email,
      displayName: data.displayName || null,
      avatarUrl: data.avatarUrl || null,
      preferredLocale: data.preferredLocale || 'uk',
    };
    const [user] = await this.db.insert(schema.users).values(newUser).returning();
    return user;
  }

  async update(id: string, data: Partial<Pick<schema.NewUser, 'displayName' | 'avatarUrl' | 'preferredLocale' | 'mode' | 'pseudonym'>>): Promise<schema.User> {
    const [user] = await this.db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }
}
