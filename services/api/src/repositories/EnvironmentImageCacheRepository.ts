import { desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { cosineSimilarity } from '../services/embeddingService';
import { logger } from '../utils/logger';

export interface FindSimilarResult {
  id: string;
  description: string;
  storagePath: string;
  storageUrl: string | null;
  score: number;
}

export interface FindSimilarManyOptions {
  descriptionPrefix?: string;
  limitResults?: number;
}

export class EnvironmentImageCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findSimilar(
    embedding: number[],
    threshold: number,
    options?: { descriptionPrefix?: string }
  ): Promise<FindSimilarResult | null> {
    const all = await this.db.select().from(schema.environmentImageCache);

    if (all.length === 0) return null;

    let best: FindSimilarResult | null = null;

    for (const row of all) {
      if (options?.descriptionPrefix && !row.description.startsWith(options.descriptionPrefix)) {
        continue;
      }
      const stored = row.descriptionEmbedding as number[];
      if (!stored || stored.length !== embedding.length) continue;

      const score = cosineSimilarity(embedding, stored);
      if (score >= threshold && (!best || score > best.score)) {
        best = {
          id: row.id,
          description: row.description,
          storagePath: row.storagePath,
          storageUrl: row.storageUrl,
          score,
        };
      }
    }

    if (best) {
      logger.info({ cacheId: best.id, score: best.score.toFixed(3) }, 'Environment cache hit');
    }

    return best;
  }

  async findSimilarMany(
    embedding: number[],
    threshold: number,
    options?: FindSimilarManyOptions
  ): Promise<FindSimilarResult[]> {
    const all = await this.db.select().from(schema.environmentImageCache);
    const matches: FindSimilarResult[] = [];

    for (const row of all) {
      if (options?.descriptionPrefix && !row.description.startsWith(options.descriptionPrefix)) {
        continue;
      }
      const stored = row.descriptionEmbedding as number[];
      if (!stored || stored.length !== embedding.length) continue;

      const score = cosineSimilarity(embedding, stored);
      if (score < threshold) continue;
      matches.push({
        id: row.id,
        description: row.description,
        storagePath: row.storagePath,
        storageUrl: row.storageUrl,
        score,
      });
    }

    matches.sort((left, right) => right.score - left.score);
    return matches.slice(0, options?.limitResults ?? matches.length);
  }

  async listForAdmin(params: {
    limit: number;
    offset: number;
  }): Promise<schema.EnvironmentImageCache[]> {
    return this.db
      .select()
      .from(schema.environmentImageCache)
      .orderBy(desc(schema.environmentImageCache.createdAt), desc(schema.environmentImageCache.id))
      .limit(params.limit)
      .offset(params.offset);
  }

  async countForAdmin(): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.environmentImageCache);
    return result?.count ?? 0;
  }

  async getById(id: string): Promise<schema.EnvironmentImageCache | null> {
    const [row] = await this.db
      .select()
      .from(schema.environmentImageCache)
      .where(eq(schema.environmentImageCache.id, id))
      .limit(1);
    return row || null;
  }

  async getByIds(ids: string[]): Promise<schema.EnvironmentImageCache[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.environmentImageCache)
      .where(inArray(schema.environmentImageCache.id, ids));
  }

  async create(data: schema.NewEnvironmentImageCache): Promise<schema.EnvironmentImageCache> {
    const [row] = await this.db.insert(schema.environmentImageCache).values(data).returning();
    return row;
  }
}
