import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class OAuthRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByProvider(
    provider: string,
    providerUserId: string
  ): Promise<schema.OAuthIdentity | null> {
    const [identity] = await this.db
      .select()
      .from(schema.oauthIdentities)
      .where(
        and(
          eq(schema.oauthIdentities.provider, provider),
          eq(schema.oauthIdentities.providerUserId, providerUserId)
        )
      )
      .limit(1);
    return identity || null;
  }

  async findByUserId(userId: string): Promise<schema.OAuthIdentity[]> {
    return this.db
      .select()
      .from(schema.oauthIdentities)
      .where(eq(schema.oauthIdentities.userId, userId));
  }

  async findProvidersByUserId(userId: string): Promise<Array<{ provider: string; providerEmail: string | null }>> {
    return this.db
      .select({
        provider: schema.oauthIdentities.provider,
        providerEmail: schema.oauthIdentities.providerEmail,
      })
      .from(schema.oauthIdentities)
      .where(eq(schema.oauthIdentities.userId, userId));
  }

  async create(data: schema.NewOAuthIdentity): Promise<schema.OAuthIdentity> {
    const [identity] = await this.db
      .insert(schema.oauthIdentities)
      .values(data)
      .returning();
    return identity;
  }

  async updateTokens(
    identityId: string,
    data: {
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
      rawUserInfo?: unknown;
    }
  ): Promise<void> {
    await this.db
      .update(schema.oauthIdentities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.oauthIdentities.id, identityId));
  }

  async deleteByUserAndProvider(userId: string, provider: string): Promise<void> {
    await this.db
      .delete(schema.oauthIdentities)
      .where(
        and(
          eq(schema.oauthIdentities.userId, userId),
          eq(schema.oauthIdentities.provider, provider)
        )
      );
  }
}
