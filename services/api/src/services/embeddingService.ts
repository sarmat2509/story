import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { logger } from '../utils/logger';

const EMBEDDING_MODEL = 'text-embedding-004';

let genaiInstance: GoogleGenAI | null = null;

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
  const ai = getGenAI();
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
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
