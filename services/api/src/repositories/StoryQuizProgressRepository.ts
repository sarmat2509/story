import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface StoryQuizProgressOwnerKey {
  storyQuizId: string;
  ownerType: string;
  ownerId: string;
}

export class StoryQuizProgressRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByOwner(key: StoryQuizProgressOwnerKey): Promise<schema.StoryQuizProgress | null> {
    const [row] = await this.db
      .select()
      .from(schema.storyQuizProgress)
      .where(
        and(
          eq(schema.storyQuizProgress.storyQuizId, key.storyQuizId),
          eq(schema.storyQuizProgress.ownerType, key.ownerType),
          eq(schema.storyQuizProgress.ownerId, key.ownerId)
        )
      )
      .limit(1);
    return row || null;
  }

  async upsert(input: schema.NewStoryQuizProgress): Promise<schema.StoryQuizProgress> {
    const [row] = await this.db
      .insert(schema.storyQuizProgress)
      .values({
        ...input,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.storyQuizProgress.storyQuizId,
          schema.storyQuizProgress.ownerType,
          schema.storyQuizProgress.ownerId,
        ],
        set: {
          answers: input.answers,
          completedCheckRewardAt: input.completedCheckRewardAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error('Failed to upsert story quiz progress');
    return row;
  }
}
