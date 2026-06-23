import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface StoryQuizKey {
  storyId: string;
  language: string;
  quizAgeBucket: string;
  promptVersion: string;
  sourceFingerprint: string;
}

export class StoryQuizRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByKey(key: StoryQuizKey): Promise<schema.StoryQuiz | null> {
    const [row] = await this.db
      .select()
      .from(schema.storyQuizzes)
      .where(
        and(
          eq(schema.storyQuizzes.storyId, key.storyId),
          eq(schema.storyQuizzes.language, key.language),
          eq(schema.storyQuizzes.quizAgeBucket, key.quizAgeBucket),
          eq(schema.storyQuizzes.promptVersion, key.promptVersion),
          eq(schema.storyQuizzes.sourceFingerprint, key.sourceFingerprint)
        )
      )
      .limit(1);
    return row || null;
  }

  async upsertGenerating(input: schema.NewStoryQuiz): Promise<schema.StoryQuiz> {
    const [row] = await this.db
      .insert(schema.storyQuizzes)
      .values({
        ...input,
        status: 'generating',
        payload: null,
        errorMessage: null,
        generationTimeMs: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.storyQuizzes.storyId,
          schema.storyQuizzes.language,
          schema.storyQuizzes.quizAgeBucket,
          schema.storyQuizzes.promptVersion,
          schema.storyQuizzes.sourceFingerprint,
        ],
        set: {
          status: 'generating',
          payload: null,
          errorMessage: null,
          generationTimeMs: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error('Failed to upsert story quiz generation row');
    return row;
  }

  async markCompleted(
    id: string,
    payload: unknown,
    generationTimeMs: number
  ): Promise<schema.StoryQuiz> {
    const [row] = await this.db
      .update(schema.storyQuizzes)
      .set({
        status: 'completed',
        payload,
        errorMessage: null,
        generationTimeMs,
        updatedAt: new Date(),
      })
      .where(eq(schema.storyQuizzes.id, id))
      .returning();
    if (!row) throw new Error('Failed to mark story quiz completed');
    return row;
  }

  async markFailed(id: string, errorMessage: string): Promise<schema.StoryQuiz> {
    const [row] = await this.db
      .update(schema.storyQuizzes)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(schema.storyQuizzes.id, id))
      .returning();
    if (!row) throw new Error('Failed to mark story quiz failed');
    return row;
  }
}
