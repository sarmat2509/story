import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { cosineSimilarity } from '../services/embeddingService';
import { logger } from '../utils/logger';

export interface FindSimilarResult {
  id: string;
  description: string;
  storagePath: string;
  frontStoragePath: string | null;
  score: number;
}

export class LlmTurnaroundCacheRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findSimilar(
    embedding: number[],
    threshold: number
  ): Promise<FindSimilarResult | null> {
    const all = await this.db.select().from(schema.llmTurnaroundCache);

    if (all.length === 0) return null;

    let best: FindSimilarResult | null = null;

    for (const row of all) {
      const stored = row.descriptionEmbedding as number[];
      if (!stored || stored.length !== embedding.length) continue;

      const score = cosineSimilarity(embedding, stored);
      if (score >= threshold && (!best || score > best.score)) {
        best = {
          id: row.id,
          description: row.description,
          storagePath: row.storagePath,
          frontStoragePath: row.frontStoragePath,
          score,
        };
      }
    }

    if (best) {
      logger.info(
        { cacheId: best.id, score: best.score.toFixed(3) },
        'LLM turnaround cache hit'
      );
    }

    return best;
  }

  async getById(id: string): Promise<schema.LlmTurnaroundCache | null> {
    const [row] = await this.db
      .select()
      .from(schema.llmTurnaroundCache)
      .where(eq(schema.llmTurnaroundCache.id, id))
      .limit(1);
    return row || null;
  }

  async create(
    data: schema.NewLlmTurnaroundCache
  ): Promise<schema.LlmTurnaroundCache> {
    const [row] = await this.db
      .insert(schema.llmTurnaroundCache)
      .values(data)
      .returning();
    return row;
  }
}
