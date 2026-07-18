import assert from 'node:assert/strict';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../repositories';
import { MockEmbeddingGenerator } from '../../testing/ai';
import {
  clearAiServiceTestOverrides,
  installAiServiceTestOverrides,
} from '../aiService';
import { selectStoryArtifactForPrompt } from '../storyArtifactService';

const artifact = {
  id: '22222222-2222-4222-8222-222222222222',
  artifactCode: 'lantern-badge',
  title: 'Lantern Badge',
  description: 'A badge earned by sharing the light.',
  imagePath: 'artifacts/lantern-badge.png',
};

async function main(): Promise<void> {
  const embedding = new MockEmbeddingGenerator().queueEmbedding([0.25, 0.5, 0.75]);
  let repositoryInput: any;
  installAiServiceTestOverrides({ embeddingGenerator: embedding.generate });
  installRepositoryTestOverrides({
    storyArtifact: {
      findBestForStoryContext: async (input: any) => {
        repositoryInput = input;
        return {
        artifact,
        source: 'semantic',
        score: 0.91,
        candidateCount: 1,
        scenarioFiltered: false,
        };
      },
    } as any,
    dictionary: {
      findTranslations: async () => [],
    } as any,
  });

  try {
    const result = await selectStoryArtifactForPrompt({ locale: 'en', goalName: 'Kindness' });
    assert.deepEqual(result, {
      ...artifact,
      selection: {
        source: 'semantic',
        score: 0.91,
        candidateCount: 1,
        scenarioFiltered: false,
      },
    });
    assert.deepEqual(repositoryInput.queryEmbedding, [0.25, 0.5, 0.75]);
    assert.deepEqual(embedding.requests, ['Kindness']);
    embedding.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
  }

  console.log('story artifact selection contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
