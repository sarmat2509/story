/**
 * AlignmentRepository - Forced alignment data per story (Phase 2)
 * One alignment per story. Used for word-level highlighting with audio.
 */

import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import type { AlignmentData } from '@wondertales/shared';

export class AlignmentRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findByStoryId(storyId: string): Promise<{ data: AlignmentData } | null> {
    const [row] = await this.db
      .select({ data: schema.alignments.data })
      .from(schema.alignments)
      .where(eq(schema.alignments.storyId, storyId))
      .limit(1);
    if (!row || !row.data) return null;
    return { data: row.data as AlignmentData };
  }

  async deleteByStoryId(storyId: string): Promise<void> {
    await this.db.delete(schema.alignments).where(eq(schema.alignments.storyId, storyId));
  }

  async upsert(storyId: string, data: AlignmentData, assetId?: string | null): Promise<void> {
    const now = new Date();
    await this.db
      .insert(schema.alignments)
      .values({
        storyId,
        assetId: assetId ?? null,
        data: data as unknown as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.alignments.storyId,
        set: {
          assetId: assetId ?? undefined,
          data: data as unknown as Record<string, unknown>,
          updatedAt: now,
        },
      });
  }
}
