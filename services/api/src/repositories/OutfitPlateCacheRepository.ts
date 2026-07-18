import { SQL, and, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { cosineSimilarity } from '../services/embeddingService';
import { logger } from '../utils/logger';

type StringListFilter = string[] | readonly string[] | null | undefined;

export interface OutfitPlateSearchFilters {
  presentationGroups?: StringListFilter;
  purposeTags?: StringListFilter;
  seasonTags?: StringListFilter;
  climateTags?: StringListFilter;
  eraTags?: StringListFilter;
  settingTags?: StringListFilter;
  activityTags?: StringListFilter;
  silhouetteTags?: StringListFilter;
  footwearTags?: StringListFilter;
  componentTags?: StringListFilter;
  coverageTags?: StringListFilter;
  formality?: string | string[] | null;
  catalogSource?: string | string[] | null;
}

export interface OutfitPlateSearchResult {
  id: string;
  outfitText: string;
  storagePath: string;
  storageUrl: string | null;
  catalogSource: string | null;
  formality: string | null;
  presentationGroups: string[];
  purposeTags: string[];
  seasonTags: string[];
  climateTags: string[];
  eraTags: string[];
  settingTags: string[];
  activityTags: string[];
  footwearTags: string[];
  componentTags: string[];
  coverageTags: string[];
  tagScore: number;
}

export interface OutfitPlateFindSimilarResult {
  id: string;
  outfitText: string;
  storagePath: string;
  storageUrl: string | null;
  score: number;
  tagScore: number;
  catalogSource: string | null;
}

export interface OutfitPlateFindSimilarOptions {
  filters?: OutfitPlateSearchFilters;
  catalogOnly?: boolean;
  plannedCatalogOnly?: boolean;
  generatedOnly?: boolean;
  relaxedFallback?: boolean;
  limitResults?: number;
  excludeIds?: string[];
}

const TAG_FILTERS = [
  ['presentationGroups', 'presentationGroups', 4],
  ['seasonTags', 'seasonTags', 4],
  ['purposeTags', 'purposeTags', 3],
  ['climateTags', 'climateTags', 2],
  ['eraTags', 'eraTags', 2],
  ['settingTags', 'settingTags', 2],
  ['activityTags', 'activityTags', 2],
  ['silhouetteTags', 'silhouetteTags', 1],
  ['footwearTags', 'footwearTags', 1],
  ['componentTags', 'componentTags', 1],
  ['coverageTags', 'coverageTags', 1],
] as const;

function normalizeList(values: StringListFilter): string[] {
  if (!values) return [];
  return Array.from(
    new Set(
      Array.from(values)
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizeScalarList(values: string | string[] | null | undefined): string[] {
  if (!values) return [];
  return normalizeList(Array.isArray(values) ? values : [values]);
}

function rowList(values: string[] | null | undefined): string[] {
  return normalizeList(values || []);
}

function arrayLiteral(values: string[]): SQL {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

function arrayOverlap(column: unknown, values: StringListFilter): SQL | null {
  const list = normalizeList(values);
  if (list.length === 0) return null;
  return sql`${column} && ${arrayLiteral(list)}`;
}

function listOverlapCount(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.reduce((count, value) => count + (rightSet.has(value) ? 1 : 0), 0);
}

function buildFilterConditions(
  filters: OutfitPlateSearchFilters | undefined,
  options?: {
    catalogOnly?: boolean;
    plannedCatalogOnly?: boolean;
    generatedOnly?: boolean;
    excludeIds?: string[];
  },
): SQL[] {
  const conditions: SQL[] = [];
  const table = schema.outfitPlateCache;

  if (options?.plannedCatalogOnly) {
    conditions.push(sql`${table.catalogSource} LIKE ${'%:planned'}`);
  } else if (options?.catalogOnly) {
    conditions.push(isNotNull(table.catalogSource));
  } else if (options?.generatedOnly) {
    conditions.push(isNull(table.catalogSource));
  }

  const excludeIds = Array.from(
    new Set((options?.excludeIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
  );
  if (excludeIds.length > 0) {
    conditions.push(notInArray(table.id, excludeIds));
  }

  if (!filters) return conditions;

  const formality = normalizeScalarList(filters.formality);
  if (formality.length === 1) {
    conditions.push(eq(table.formality, formality[0]));
  } else if (formality.length > 1) {
    conditions.push(inArray(table.formality, formality));
  }

  const catalogSource = normalizeScalarList(filters.catalogSource);
  if (catalogSource.length === 1) {
    conditions.push(eq(table.catalogSource, catalogSource[0]));
  } else if (catalogSource.length > 1) {
    conditions.push(inArray(table.catalogSource, catalogSource));
  }

  for (const [filterKey, columnKey] of TAG_FILTERS) {
    const condition = arrayOverlap(table[columnKey], filters[filterKey]);
    if (condition) conditions.push(condition);
  }

  return conditions;
}

function tagScoreForRow(
  row: schema.OutfitPlateCache,
  filters: OutfitPlateSearchFilters | undefined,
): number {
  if (!filters) return 0;

  let score = 0;
  for (const [filterKey, columnKey, weight] of TAG_FILTERS) {
    const filterValues = normalizeList(filters[filterKey]);
    if (filterValues.length === 0) continue;
    score += listOverlapCount(rowList(row[columnKey]), filterValues) * weight;
  }

  const formality = normalizeScalarList(filters.formality);
  if (formality.length > 0 && row.formality && formality.includes(row.formality.toLowerCase())) {
    score += 2;
  }

  const catalogSource = normalizeScalarList(filters.catalogSource);
  if (
    catalogSource.length > 0 &&
    row.catalogSource &&
    catalogSource.includes(row.catalogSource.toLowerCase())
  ) {
    score += 1;
  }

  return score;
}

function toSearchResult(
  row: schema.OutfitPlateCache,
  filters?: OutfitPlateSearchFilters,
): OutfitPlateSearchResult {
  return {
    id: row.id,
    outfitText: row.outfitText,
    storagePath: row.storagePath,
    storageUrl: row.storageUrl,
    catalogSource: row.catalogSource,
    formality: row.formality,
    presentationGroups: rowList(row.presentationGroups),
    purposeTags: rowList(row.purposeTags),
    seasonTags: rowList(row.seasonTags),
    climateTags: rowList(row.climateTags),
    eraTags: rowList(row.eraTags),
    settingTags: rowList(row.settingTags),
    activityTags: rowList(row.activityTags),
    footwearTags: rowList(row.footwearTags),
    componentTags: rowList(row.componentTags),
    coverageTags: rowList(row.coverageTags),
    tagScore: tagScoreForRow(row, filters),
  };
}

export class OutfitPlateCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findSimilar(
    embedding: number[],
    threshold: number,
    options?: OutfitPlateFindSimilarOptions,
  ): Promise<OutfitPlateFindSimilarResult | null> {
    const [best] = await this.findSimilarMany(embedding, threshold, {
      ...options,
      limitResults: 1,
    });

    if (best) {
      logger.info(
        {
          cacheId: best.id,
          score: best.score.toFixed(3),
          tagScore: best.tagScore,
          catalogSource: best.catalogSource,
        },
        'Outfit plate cache hit',
      );
    }

    return best || null;
  }

  async findSimilarMany(
    embedding: number[],
    threshold: number,
    options?: OutfitPlateFindSimilarOptions,
  ): Promise<OutfitPlateFindSimilarResult[]> {
    const primaryCandidates = await this.listRowsForSearch(options?.filters, {
      catalogOnly: options?.catalogOnly,
      plannedCatalogOnly: options?.plannedCatalogOnly,
      excludeIds: options?.excludeIds,
    });
    const all =
      primaryCandidates.length > 0 || !options?.relaxedFallback
        ? primaryCandidates
        : await this.listRowsForSearch(undefined, {
          catalogOnly: options?.catalogOnly,
          plannedCatalogOnly: options?.plannedCatalogOnly,
          generatedOnly: options?.generatedOnly,
          excludeIds: options?.excludeIds,
        });

    if (all.length === 0) return [];

    const matches: OutfitPlateFindSimilarResult[] = [];

    for (const row of all) {
      const stored = row.descriptionEmbedding as number[];
      if (!stored || stored.length !== embedding.length) continue;

      const score = cosineSimilarity(embedding, stored);
      if (score >= threshold) {
        matches.push({
          id: row.id,
          outfitText: row.outfitText,
          storagePath: row.storagePath,
          storageUrl: row.storageUrl,
          score,
          tagScore: tagScoreForRow(row, options?.filters),
          catalogSource: row.catalogSource,
        });
      }
    }

    matches.sort((left, right) => right.score - left.score);

    const limitResults = Math.max(1, options?.limitResults ?? matches.length);
    return matches.slice(0, limitResults);
  }

  async listForAdmin(params: {
    limit: number;
    offset: number;
  }): Promise<schema.OutfitPlateCache[]> {
    return this.db
      .select()
      .from(schema.outfitPlateCache)
      .orderBy(desc(schema.outfitPlateCache.createdAt), desc(schema.outfitPlateCache.id))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countForAdmin(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.outfitPlateCache);
    return Number(row?.count || 0);
  }

  async searchCatalog(
    filters: OutfitPlateSearchFilters,
    options?: { limit?: number; catalogOnly?: boolean },
  ): Promise<OutfitPlateSearchResult[]> {
    const rows = await this.listRowsForSearch(filters, {
      catalogOnly: options?.catalogOnly ?? true,
      limit: options?.limit,
    });

    return rows
      .map((row) => toSearchResult(row, filters))
      .sort((a, b) => b.tagScore - a.tagScore || a.outfitText.localeCompare(b.outfitText));
  }

  private async listRowsForSearch(
    filters?: OutfitPlateSearchFilters,
    options?: {
      catalogOnly?: boolean;
      plannedCatalogOnly?: boolean;
      generatedOnly?: boolean;
      limit?: number;
      excludeIds?: string[];
    },
  ): Promise<schema.OutfitPlateCache[]> {
    const conditions = buildFilterConditions(filters, {
      catalogOnly: options?.catalogOnly,
      plannedCatalogOnly: options?.plannedCatalogOnly,
      generatedOnly: options?.generatedOnly,
      excludeIds: options?.excludeIds,
    });
    let query = this.db.select().from(schema.outfitPlateCache).$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    if (options?.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    return query;
  }

  async getById(id: string): Promise<schema.OutfitPlateCache | null> {
    const [row] = await this.db
      .select()
      .from(schema.outfitPlateCache)
      .where(eq(schema.outfitPlateCache.id, id))
      .limit(1);
    return row || null;
  }

  async getByIds(ids: string[]): Promise<schema.OutfitPlateCache[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.outfitPlateCache)
      .where(inArray(schema.outfitPlateCache.id, ids));
  }

  async create(data: schema.NewOutfitPlateCache): Promise<schema.OutfitPlateCache> {
    const [row] = await this.db.insert(schema.outfitPlateCache).values(data).returning();
    return row;
  }

  async upsertByStoragePath(
    data: schema.NewOutfitPlateCache,
  ): Promise<schema.OutfitPlateCache> {
    const [row] = await this.db
      .insert(schema.outfitPlateCache)
      .values(data)
      .onConflictDoUpdate({
        target: schema.outfitPlateCache.storagePath,
        set: {
          outfitText: data.outfitText,
          descriptionEmbedding: data.descriptionEmbedding,
          imageStyle: data.imageStyle,
          ageGroup: data.ageGroup,
          storageUrl: data.storageUrl,
          catalogSource: data.catalogSource,
          formality: data.formality,
          presentationGroups: data.presentationGroups,
          purposeTags: data.purposeTags,
          seasonTags: data.seasonTags,
          climateTags: data.climateTags,
          eraTags: data.eraTags,
          settingTags: data.settingTags,
          activityTags: data.activityTags,
          silhouetteTags: data.silhouetteTags,
          footwearTags: data.footwearTags,
          componentTags: data.componentTags,
          colorPalette: data.colorPalette,
          materials: data.materials,
          patterns: data.patterns,
          detailTags: data.detailTags,
          coverageTags: data.coverageTags,
        },
      })
      .returning();
    return row;
  }
}
