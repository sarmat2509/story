import { config } from '../config';
import type { EnvironmentImageCache } from '../db/schema';
import { getEnvironmentImageCacheRepository } from '../repositories';
import type { FindSimilarResult } from '../repositories/EnvironmentImageCacheRepository';
import {
  ENVIRONMENT_REFERENCE_CACHE_PREFIX,
  buildEnvironmentImageCacheDescription,
} from '../prompts/image';
import { generateEmbedding } from './embeddingService';

function imageUrlFor(storagePath: string): string {
  return `/api/v1/assets/${storagePath.replace(/^\/+/, '')}`;
}

function readableDescription(description: string): string {
  return description.startsWith(ENVIRONMENT_REFERENCE_CACHE_PREFIX)
    ? description.slice(ENVIRONMENT_REFERENCE_CACHE_PREFIX.length).trim()
    : description.replace(/^\[[^\]]+\]\s*/, '').trim();
}

function cacheVersion(description: string): string | null {
  return description.match(/^\[([^\]]+)\]/)?.[1] ?? null;
}

function mapAdminEnvironment(row: EnvironmentImageCache) {
  return {
    id: row.id,
    description: readableDescription(row.description),
    cacheDescription: row.description,
    cacheVersion: cacheVersion(row.description),
    isCurrentVersion: row.description.startsWith(ENVIRONMENT_REFERENCE_CACHE_PREFIX),
    imageUrl: imageUrlFor(row.storagePath),
    storagePath: row.storagePath,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAdminEnvironmentMatch(row: FindSimilarResult, threshold: number) {
  return {
    id: row.id,
    description: readableDescription(row.description),
    cacheDescription: row.description,
    cacheVersion: cacheVersion(row.description),
    isCurrentVersion: row.description.startsWith(ENVIRONMENT_REFERENCE_CACHE_PREFIX),
    imageUrl: imageUrlFor(row.storagePath),
    storagePath: row.storagePath,
    score: row.score,
    meetsThreshold: row.score >= threshold,
  };
}

export async function listAdminEnvironments(params: { limit: number; offset: number }) {
  const repo = getEnvironmentImageCacheRepository();
  const [items, total] = await Promise.all([repo.listForAdmin(params), repo.countForAdmin()]);

  return {
    items: items.map(mapAdminEnvironment),
    meta: { ...params, total },
  };
}

export async function searchAdminEnvironments(params: { description: string; limit: number }) {
  const description = params.description.trim();
  const threshold = config.image.environmentEmbeddingSimilarityThreshold;
  const cacheDescription = buildEnvironmentImageCacheDescription(description);
  const embedding = await generateEmbedding(cacheDescription);
  const matches = await getEnvironmentImageCacheRepository().findSimilarMany(embedding, 0, {
    limitResults: params.limit,
  });

  return {
    description,
    threshold,
    items: matches.map((item) => mapAdminEnvironmentMatch(item, threshold)),
  };
}
