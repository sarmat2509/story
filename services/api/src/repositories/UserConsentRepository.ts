import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class UserConsentRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async record(data: schema.NewUserConsentRecord): Promise<void> {
    await this.db
      .insert(schema.userConsentRecords)
      .values(data)
      .onConflictDoNothing({
        target: [
          schema.userConsentRecords.userId,
          schema.userConsentRecords.consentType,
          schema.userConsentRecords.documentVersion,
        ],
      });
  }

  async findLatest(
    userId: string,
    consentType: string
  ): Promise<schema.UserConsentRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.userConsentRecords)
      .where(and(
        eq(schema.userConsentRecords.userId, userId),
        eq(schema.userConsentRecords.consentType, consentType)
      ))
      .orderBy(desc(schema.userConsentRecords.acceptedAt))
      .limit(1);
    return row || null;
  }

  async hasVersion(userId: string, consentType: string, documentVersion: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.userConsentRecords.id })
      .from(schema.userConsentRecords)
      .where(and(
        eq(schema.userConsentRecords.userId, userId),
        eq(schema.userConsentRecords.consentType, consentType),
        eq(schema.userConsentRecords.documentVersion, documentVersion)
      ))
      .limit(1);
    return !!row;
  }
}

