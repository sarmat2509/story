import { config } from '../config';
import type { OutfitPlateCache } from '../db/schema';
import { getOutfitPlateCacheRepository } from '../repositories';
import type { OutfitPlateFindSimilarResult } from '../repositories/OutfitPlateCacheRepository';
import { generateEmbedding } from './embeddingService';
import { inferOutfitCatalogFilters } from './outfitCatalogTags';

function imageUrlFor(storagePath: string): string {
  return `/api/v1/assets/${storagePath.replace(/^\/+/, '')}`;
}

function mapAdminOutfit(row: OutfitPlateCache) {
  return {
    id: row.id,
    description: row.outfitText,
    imageUrl: imageUrlFor(row.storagePath),
    storagePath: row.storagePath,
    catalogSource: row.catalogSource,
    imageStyle: row.imageStyle,
    ageGroup: row.ageGroup,
    formality: row.formality,
    presentationGroups: row.presentationGroups ?? [],
    purposeTags: row.purposeTags ?? [],
    seasonTags: row.seasonTags ?? [],
    climateTags: row.climateTags ?? [],
    settingTags: row.settingTags ?? [],
    activityTags: row.activityTags ?? [],
    silhouetteTags: row.silhouetteTags ?? [],
    footwearTags: row.footwearTags ?? [],
    componentTags: row.componentTags ?? [],
    colorPalette: row.colorPalette ?? [],
    materials: row.materials ?? [],
    patterns: row.patterns ?? [],
    detailTags: row.detailTags ?? [],
    coverageTags: row.coverageTags ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAdminOutfitMatch(row: OutfitPlateFindSimilarResult, threshold: number) {
  return {
    id: row.id,
    description: row.outfitText,
    imageUrl: imageUrlFor(row.storagePath),
    storagePath: row.storagePath,
    catalogSource: row.catalogSource,
    score: row.score,
    tagScore: row.tagScore,
    meetsThreshold: row.score >= threshold,
  };
}

export async function listAdminOutfits(params: { limit: number; offset: number }) {
  const repo = getOutfitPlateCacheRepository();
  const [items, total] = await Promise.all([repo.listForAdmin(params), repo.countForAdmin()]);

  return {
    items: items.map(mapAdminOutfit),
    meta: { ...params, total },
  };
}

export async function searchAdminOutfits(params: { description: string; limit: number }) {
  const description = params.description.trim();
  const threshold = config.image.outfitPlateCatalogSimilarityThreshold;
  const filters = inferOutfitCatalogFilters(description);
  const embedding = await generateEmbedding(description);
  const matches = await getOutfitPlateCacheRepository().findSimilarMany(embedding, 0, {
    filters,
    plannedCatalogOnly: true,
    relaxedFallback: true,
    limitResults: params.limit,
  });

  return {
    description,
    threshold,
    filters,
    items: matches.map((item) => mapAdminOutfitMatch(item, threshold)),
  };
}
