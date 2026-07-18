import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { logger } from '../utils/logger';

// text-embedding-004 deprecated Jan 2026; use gemini-embedding-001
const EMBEDDING_MODEL = 'gemini-embedding-001';

let genaiInstance: GoogleGenAI | null = null;
let testEmbeddingGenerator: ((text: string) => Promise<number[]>) | null = null;

/** Test-only external boundary replacement; production embedding logic is unchanged. */
export function setEmbeddingGeneratorForTesting(
  generator: ((text: string) => Promise<number[]>) | null
): void {
  if (generator && config.nodeEnv === 'production') {
    throw new Error('Embedding test override cannot be installed in production');
  }
  testEmbeddingGenerator = generator;
}

function getGenAI(): GoogleGenAI {
  if (!genaiInstance) {
    const apiKey = config.google.apiKey || config.ai.geminiApiKey;
    if (!apiKey) {
      throw new Error('Missing GOOGLE_API_KEY or GEMINI_API_KEY for embedding service');
    }
    genaiInstance = new GoogleGenAI({ apiKey });
  }
  return genaiInstance;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (testEmbeddingGenerator) {
    return testEmbeddingGenerator(text);
  }
  const ai = getGenAI();
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: 768 }, // Match legacy text-embedding-004 dims for cosineSimilarity with existing DB embeddings
    });
    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error('No embeddings returned from Gemini API');
    }
    return result.embeddings[0].values as number[];
  } catch (error) {
    logger.error({ err: error, textLength: text.length }, 'Failed to generate embedding');
    throw error;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  if (denominator === 0) return 0;
  return dot / denominator;
}
