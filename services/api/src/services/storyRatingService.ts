/**
 * Story Rating Service - Public story ratings (1-5 emoji scale)
 * Deduplication by voter_id and ip_address. One vote per story per voter/IP.
 */

import { getStoryRatingRepository } from '../repositories';
import { getStoryRepository } from '../repositories';

export type SubmitRatingResult = { ok: true } | { ok: false; alreadyVoted: true };

export async function submitRating(
  storyId: string,
  voterId: string,
  rating: number,
  ipAddress: string
): Promise<SubmitRatingResult> {
  const repo = getStoryRatingRepository();
  const storyRepo = getStoryRepository();

  const [byVoter, byIp] = await Promise.all([
    repo.hasVotedByVoterId(storyId, voterId),
    repo.hasVotedByIp(storyId, ipAddress),
  ]);

  if (byVoter || byIp) {
    return { ok: false, alreadyVoted: true };
  }

  const safeIp = ipAddress?.trim() || '0.0.0.0';

  await repo.insertRating(storyId, voterId, safeIp, rating);
  await repo.incrementStoryAggregates(storyId, rating);

  return { ok: true };
}

export interface StoryRatingInfo {
  avg: number;
  count: number;
}

export async function getRatingForStory(storyId: string): Promise<StoryRatingInfo | null> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findById(storyId);
  if (!story || (story.ratingCount ?? 0) === 0) {
    return null;
  }
  const sum = story.ratingSum ?? 0;
  const count = story.ratingCount ?? 0;
  return {
    avg: count > 0 ? sum / count : 0,
    count,
  };
}
