import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { cosineSimilarity } from '../services/embeddingService';

export interface StoryArtifactMatch {
  artifact: schema.StoryArtifact;
  score: number | null;
  source: 'embedding' | 'global_random';
  candidateCount: number;
  scenarioFiltered: boolean;
}

export class StoryArtifactRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async findById(id: string): Promise<schema.StoryArtifact | null> {
    const [artifact] = await this.db
      .select()
      .from(schema.storyArtifacts)
      .where(eq(schema.storyArtifacts.id, id))
      .limit(1);

    return artifact || null;
  }

  async findActiveByCode(artifactCode: string): Promise<schema.StoryArtifact | null> {
    const [artifact] = await this.db
      .select()
      .from(schema.storyArtifacts)
      .where(
        and(
          eq(schema.storyArtifacts.artifactCode, artifactCode),
          eq(schema.storyArtifacts.isActive, true),
        ),
      )
      .limit(1);

    return artifact || null;
  }

  async findRandomActive(): Promise<schema.StoryArtifact | null> {
    const [artifact] = await this.db
      .select()
      .from(schema.storyArtifacts)
      .where(eq(schema.storyArtifacts.isActive, true))
      .orderBy(sql`random()`)
      .limit(1);

    return artifact || null;
  }

  async findAllActive(): Promise<schema.StoryArtifact[]> {
    return this.db
      .select()
      .from(schema.storyArtifacts)
      .where(eq(schema.storyArtifacts.isActive, true));
  }

  async updateEmbedding(params: {
    id: string;
    embedding: number[];
    embeddingModel: string;
  }): Promise<void> {
    await this.db
      .update(schema.storyArtifacts)
      .set({
        descriptionEmbedding: params.embedding,
        embeddingModel: params.embeddingModel,
        updatedAt: new Date(),
      })
      .where(eq(schema.storyArtifacts.id, params.id));
  }

  async findBestForStoryContext(params: {
    queryEmbedding?: number[];
    topK?: number;
  }): Promise<StoryArtifactMatch | null> {
    const active = await this.findAllActive();
    if (active.length === 0) return null;

    const candidates = active;
    const scenarioFiltered = false;

    if (params.queryEmbedding) {
      const scored = candidates
        .map((artifact) => {
          const stored = artifact.descriptionEmbedding;
          if (!Array.isArray(stored) || stored.length !== params.queryEmbedding!.length) {
            return null;
          }
          return {
            artifact,
            score: cosineSimilarity(params.queryEmbedding!, stored),
          };
        })
        .filter((item): item is { artifact: schema.StoryArtifact; score: number } => !!item)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const topK = Math.max(1, params.topK ?? 5);
        const shortlist = scored.slice(0, topK);
        const picked = shortlist[Math.floor(Math.random() * shortlist.length)];
        return {
          artifact: picked.artifact,
          score: picked.score,
          source: 'embedding',
          candidateCount: candidates.length,
          scenarioFiltered,
        };
      }
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      artifact: picked,
      score: null,
      source: 'global_random',
      candidateCount: candidates.length,
      scenarioFiltered,
    };
  }
}
