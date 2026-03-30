/**
 * List image validation rows for API (owner-scoped or admin global).
 */

import type { ImageValidationResultRow } from '../db/schema';
import { getImageValidationRepository } from '../repositories';

export async function listImageValidationsForStory(
  storyId: string,
  limit: number,
  offset: number
): Promise<{ items: ImageValidationResultRow[]; total: number }> {
  const repo = getImageValidationRepository();
  const [items, total] = await Promise.all([
    repo.listByStoryId(storyId, limit, offset),
    repo.countByStoryId(storyId),
  ]);
  return { items, total };
}

export async function listAllImageValidations(
  limit: number,
  offset: number
): Promise<{ items: ImageValidationResultRow[]; total: number }> {
  const repo = getImageValidationRepository();
  const [items, total] = await Promise.all([repo.listAll(limit, offset), repo.countAll()]);
  return { items, total };
}

export async function getImageValidationById(
  id: string,
): Promise<ImageValidationResultRow | null> {
  return getImageValidationRepository().findById(id);
}
