/**
 * Persist and query vision image validation results (analytics).
 */

import { desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export interface InsertImageValidationInput {
  storyId: string;
  sceneIndex: number;
  attempt: number;
  imageStoragePath: string;
  validationScore: number;
  visionModel?: string | null;
  result: Record<string, unknown>;
}

export class ImageValidationRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async insert(input: InsertImageValidationInput): Promise<schema.ImageValidationResultRow> {
    const [row] = await this.db
      .insert(schema.imageValidationResults)
      .values({
        storyId: input.storyId,
        sceneIndex: input.sceneIndex,
        attempt: input.attempt,
        imageStoragePath: input.imageStoragePath,
        validationScore: input.validationScore,
        visionModel: input.visionModel ?? null,
        result: input.result,
      })
      .returning();
    if (!row) throw new Error('Failed to insert image_validation_results');
    return row;
  }

  async listByStoryId(
    storyId: string,
    limit: number,
    offset: number
  ): Promise<schema.ImageValidationResultRow[]> {
    return this.db
      .select()
      .from(schema.imageValidationResults)
      .where(eq(schema.imageValidationResults.storyId, storyId))
      .orderBy(desc(schema.imageValidationResults.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async listByStoragePaths(storagePaths: string[]): Promise<schema.ImageValidationResultRow[]> {
    if (storagePaths.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(schema.imageValidationResults)
      .where(inArray(schema.imageValidationResults.imageStoragePath, storagePaths));
  }

  async countByStoryId(storyId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.imageValidationResults)
      .where(eq(schema.imageValidationResults.storyId, storyId));
    return row?.n ?? 0;
  }

  async listAll(limit: number, offset: number): Promise<schema.ImageValidationResultRow[]> {
    return this.db
      .select()
      .from(schema.imageValidationResults)
      .orderBy(desc(schema.imageValidationResults.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countAll(): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.imageValidationResults);
    return row?.n ?? 0;
  }

  async findById(id: string): Promise<schema.ImageValidationResultRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.imageValidationResults)
      .where(eq(schema.imageValidationResults.id, id))
      .limit(1);
    return row || null;
  }
}
