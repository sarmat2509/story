import { eq, and, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class ChildProfileRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByUserId(userId: string): Promise<schema.ChildProfile[]> {
    return this.db
      .select()
      .from(schema.childProfiles)
      .where(and(
        eq(schema.childProfiles.userId, userId),
        eq(schema.childProfiles.isActive, true)
      ));
  }

  async findById(id: string, userId: string): Promise<schema.ChildProfile | null> {
    const [profile] = await this.db
      .select()
      .from(schema.childProfiles)
      .where(and(
        eq(schema.childProfiles.id, id),
        eq(schema.childProfiles.userId, userId),
        eq(schema.childProfiles.isActive, true)
      ))
      .limit(1);
    return profile || null;
  }

  async findByIds(userId: string, ids: string[]): Promise<schema.ChildProfile[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.childProfiles)
      .where(and(
        eq(schema.childProfiles.userId, userId),
        eq(schema.childProfiles.isActive, true),
        inArray(schema.childProfiles.id, ids)
      ));
  }

  async create(data: schema.NewChildProfile): Promise<schema.ChildProfile> {
    const [profile] = await this.db
      .insert(schema.childProfiles)
      .values(data)
      .returning();
    return profile;
  }

  async update(
    id: string,
    userId: string,
    data: Partial<Omit<schema.NewChildProfile, 'userId'>>
  ): Promise<schema.ChildProfile> {
    const [updated] = await this.db
      .update(schema.childProfiles)
      .set(data)
      .where(and(
        eq(schema.childProfiles.id, id),
        eq(schema.childProfiles.userId, userId)
      ))
      .returning();
    return updated;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await this.db
      .update(schema.childProfiles)
      .set({ isActive: false })
      .where(and(
        eq(schema.childProfiles.id, id),
        eq(schema.childProfiles.userId, userId)
      ));
  }

  async updateTurnaroundSheet(
    childId: string,
    turnaroundSheet: { url: string; generatedAt: string; sourcePhotoUrl: string },
  ): Promise<void> {
    await this.db
      .update(schema.childProfiles)
      .set({ turnaroundSheet } as any)
      .where(eq(schema.childProfiles.id, childId));
  }

  async updateAnalysis(
    id: string,
    data: {
      aiGeneratedDescription?: string;
      clothing?: unknown;
      distinctiveFeatures?: unknown;
      appearanceTraits?: unknown;
    }
  ): Promise<void> {
    await this.db
      .update(schema.childProfiles)
      .set(data as any)
      .where(eq(schema.childProfiles.id, id));
  }

  async updateDescriptionEn(
    childId: string,
    descriptionEn: string,
  ): Promise<void> {
    await this.db
      .update(schema.childProfiles)
      .set({ descriptionEn } as any)
      .where(eq(schema.childProfiles.id, childId));
  }
}
