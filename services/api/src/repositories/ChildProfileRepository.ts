import { and, count, eq, inArray, sql } from 'drizzle-orm';
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

  async findAllByUserId(userId: string): Promise<schema.ChildProfile[]> {
    return this.db
      .select()
      .from(schema.childProfiles)
      .where(eq(schema.childProfiles.userId, userId));
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

  /**
   * Same as findByIds but includes soft-deleted profiles. For story display only
   * (child still appears in cast after profile was removed from the library list).
   */
  async findByIdsIncludingInactive(userId: string, ids: string[]): Promise<schema.ChildProfile[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.childProfiles)
      .where(and(
        eq(schema.childProfiles.userId, userId),
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

  async anonymizeAndSoftDelete(
    id: string,
    userId: string,
    data: Partial<Omit<schema.NewChildProfile, 'userId'>>
  ): Promise<void> {
    await this.db
      .update(schema.childProfiles)
      .set({
        ...data,
        isActive: false,
        updatedAt: new Date(),
      } as Partial<schema.NewChildProfile>)
      .where(and(
        eq(schema.childProfiles.id, id),
        eq(schema.childProfiles.userId, userId)
      ));
  }

  async hardDelete(id: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.childProfiles)
      .where(and(
        eq(schema.childProfiles.id, id),
        eq(schema.childProfiles.userId, userId)
      ));
  }

  async updateTurnaroundSheet(
    childId: string,
    turnaroundSheet: { url: string; frontUrl?: string; generatedAt: string; sourcePhotoUrl: string },
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

  async countStoryUsage(childId: string, userId: string): Promise<number> {
    const [storiesResult, directRequestsResult, selectedRequestsResult] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.stories)
        .where(and(
          eq(schema.stories.userId, userId),
          eq(schema.stories.childProfileId, childId),
        )),
      this.db
        .select({ count: count() })
        .from(schema.storyRequests)
        .where(and(
          eq(schema.storyRequests.userId, userId),
          eq(schema.storyRequests.childProfileId, childId),
        )),
      this.db
        .select({ count: count() })
        .from(schema.storyRequests)
        .where(and(
          eq(schema.storyRequests.userId, userId),
          sql`${schema.storyRequests.selectedChildren} @> ${JSON.stringify([childId])}::jsonb`,
        )),
    ]);

    return Number(storiesResult[0]?.count ?? 0)
      + Number(directRequestsResult[0]?.count ?? 0)
      + Number(selectedRequestsResult[0]?.count ?? 0);
  }
}
