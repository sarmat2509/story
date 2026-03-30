import { eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { cosineSimilarity } from '../services/embeddingService';
import { logger } from '../utils/logger';

export interface OutfitPlateFindSimilarResult {
  id: string;
  outfitText: string;
  storagePath: string;
  storageUrl: string | null;
  score: number;
}

export class OutfitPlateCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findSimilar(
    embedding: number[],
    threshold: number,
  ): Promise<OutfitPlateFindSimilarResult | null> {
    const all = await this.db.select().from(schema.outfitPlateCache);

    if (all.length === 0) return null;

    let best: OutfitPlateFindSimilarResult | null = null;

    for (const row of all) {
      const stored = row.descriptionEmbedding as number[];
      if (!stored || stored.length !== embedding.length) continue;

      const score = cosineSimilarity(embedding, stored);
      if (score >= threshold && (!best || score > best.score)) {
        best = {
          id: row.id,
          outfitText: row.outfitText,
          storagePath: row.storagePath,
          storageUrl: row.storageUrl,
          score,
        };
      }
    }

    if (best) {
      logger.info(
        { cacheId: best.id, score: best.score.toFixed(3) },
        'Outfit plate cache hit',
      );
    }

    return best;
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
}
