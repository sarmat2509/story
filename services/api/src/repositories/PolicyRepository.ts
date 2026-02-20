import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class PolicyRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findContentPolicyRules(): Promise<schema.ContentPolicyRule[]> {
    return this.db
      .select()
      .from(schema.contentPolicyRules)
      .orderBy(schema.contentPolicyRules.sortOrder);
  }

  async findAgeEngineRules(ageGroup: string): Promise<schema.AgeEngineRule | null> {
    const [rules] = await this.db
      .select()
      .from(schema.ageEngineRules)
      .where(eq(schema.ageEngineRules.ageGroup, ageGroup))
      .limit(1);
    return rules || null;
  }
}
