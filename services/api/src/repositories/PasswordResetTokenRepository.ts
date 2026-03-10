import { eq, and, gt, lt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { randomBytes } from 'crypto';

export class PasswordResetTokenRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async create(userId: string, expiresAt: Date): Promise<schema.PasswordResetToken> {
    const token = randomBytes(32).toString('hex');
    const [row] = await this.db
      .insert(schema.passwordResetTokens)
      .values({
        userId,
        token,
        expiresAt,
      })
      .returning();
    return row;
  }

  async findByToken(token: string): Promise<schema.PasswordResetToken | null> {
    const [row] = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.token, token),
          gt(schema.passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1);
    return row || null;
  }

  async deleteByToken(token: string): Promise<void> {
    await this.db
      .delete(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.token, token));
  }

  async deleteExpired(): Promise<void> {
    await this.db
      .delete(schema.passwordResetTokens)
      .where(lt(schema.passwordResetTokens.expiresAt, new Date()));
  }
}
