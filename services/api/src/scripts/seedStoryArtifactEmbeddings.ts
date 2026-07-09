/**
 * Generate semantic embeddings for story_artifacts.
 *
 * Usage:
 *   pnpm --dir services/api exec tsx src/scripts/seedStoryArtifactEmbeddings.ts
 *   pnpm --dir services/api exec tsx src/scripts/seedStoryArtifactEmbeddings.ts --force
 */

import './loadEnvForScripts';
import { getStoryArtifactRepository } from '../repositories';
import { generateEmbedding } from '../services/embeddingService';
import { STORY_ARTIFACT_EMBEDDING_MODEL } from '../services/storyArtifactService';
import { closeDatabaseConnection } from '../db';
import { logger } from '../utils/logger';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function buildArtifactEmbeddingText(artifact: {
  title: string;
  description: string;
  semanticTags: string[];
}): string {
  return [
    `Story keepsake artifact: ${artifact.title}`,
    `Visual identity: ${artifact.description}`,
    artifact.semanticTags.length > 0 ? `Semantic tags: ${artifact.semanticTags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function seedStoryArtifactEmbeddings(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const force = hasFlag('--force');
  const repo = getStoryArtifactRepository();
  const artifacts = await repo.findAllActive();
  let updated = 0;
  let skipped = 0;

  for (const artifact of artifacts) {
    if (!force && Array.isArray(artifact.descriptionEmbedding) && artifact.descriptionEmbedding.length > 0) {
      skipped++;
      continue;
    }

    const text = buildArtifactEmbeddingText({
      title: artifact.title,
      description: artifact.description,
      semanticTags: artifact.semanticTags || [],
    });
    const embedding = await generateEmbedding(text);
    await repo.updateEmbedding({
      id: artifact.id,
      embedding,
      embeddingModel: STORY_ARTIFACT_EMBEDDING_MODEL,
    });
    updated++;
    if (updated % 25 === 0) {
      console.log(`Updated ${updated} artifact embeddings...`);
    }
  }

  console.log(`✅ Story artifact embeddings complete. Updated: ${updated}. Skipped: ${skipped}.`);
}

seedStoryArtifactEmbeddings()
  .catch((err) => {
    logger.error({ err }, 'Story artifact embedding seed failed');
    console.error('❌ Story artifact embedding seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
