/**
 * StoryRatingRepository - Public story ratings (1-5 emoji scale)
 * Deduplication by voter_id and ip_address per story.
 */

import { eq, and, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export class StoryRatingRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async hasVotedByVoterId(storyId: string, voterId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.storyRatings.id })
      .from(schema.storyRatings)
      .where(and(
        eq(schema.storyRatings.storyId, storyId),
        eq(schema.storyRatings.voterId, voterId)
      ))
      .limit(1);
    return !!row;
  }

  async hasVotedByIp(storyId: string, ipAddress: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.storyRatings.id })
      .from(schema.storyRatings)
      .where(and(
        eq(schema.storyRatings.storyId, storyId),
        eq(schema.storyRatings.ipAddress, ipAddress)
      ))
      .limit(1);
    return !!row;
  }

  async insertRating(storyId: string, voterId: string, ipAddress: string, rating: number): Promise<void> {
    await this.db.insert(schema.storyRatings).values({
      storyId,
      voterId,
      ipAddress,
      rating,
    });
  }

  async incrementStoryAggregates(storyId: string, rating: number): Promise<void> {
    await this.db
      .update(schema.stories)
      .set({
        ratingSum: sql`COALESCE(${schema.stories.ratingSum}, 0) + ${rating}`,
        ratingCount: sql`COALESCE(${schema.stories.ratingCount}, 0) + 1`,
      })
      .where(eq(schema.stories.id, storyId));
  }
}
