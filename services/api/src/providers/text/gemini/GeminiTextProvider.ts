/**
 * Gemini Text Provider
 * Implementation of ITextProvider for Google Gemini API
 * 
 * Rules:
 * - MUST implement ITextProvider interface
 * - MUST contain ONLY Gemini API-specific code
 * - NEVER contain business logic (getSceneCount, etc.)
 * - NEVER build prompts (prompts come from Domain Service)
 * - MUST adapt provider-agnostic schemas to Gemini format
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ITextProvider } from '../../base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest, StreamCallback } from '../../base/JsonSchema';
import { GeminiSchemaAdapter } from './GeminiSchemaAdapter';
import { logger } from '../../../utils/logger';

export class GeminiTextProvider implements ITextProvider {
  private client: GoogleGenerativeAI;
  private model: string = 'gemini-2.5-flash';
  private schemaAdapter: GeminiSchemaAdapter;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.schemaAdapter = new GeminiSchemaAdapter();
  }

  /**
   * Generate structured JSON response using Gemini
   * Implements ITextProvider.generateStructured
   */
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    logger.debug({ temperature: request.temperature }, 'Generating structured content with Gemini');

    // Adapt provider-agnostic schema to Gemini format
    const geminiSchema = this.schemaAdapter.convert(request.schema);

    // Create Gemini model with schema
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: geminiSchema as any, // TypeScript workaround for complex nested schemas
        temperature: request.temperature ?? 0.7,
        ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
        ...(request.topP && { topP: request.topP }),
        ...(request.topK && { topK: request.topK })
      }
    });

    try {
      // Call Gemini API with retry logic
      const result = await this.callGeminiWithRetry(() => model.generateContent(request.prompt));
      const responseText = result.response.text();

      // Parse JSON response
      const parsed = JSON.parse(responseText) as T;
      return parsed;
    } catch (error) {
      logger.error({ error }, 'Gemini structured generation failed');
      throw new Error(`Gemini structured generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate free-form text response using Gemini
   * Implements ITextProvider.generateText
   */
  async generateText(request: GenerateTextRequest): Promise<string> {
    logger.debug({ temperature: request.temperature }, 'Generating text content with Gemini');

    // Create Gemini model
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
        ...(request.topP && { topP: request.topP }),
        ...(request.topK && { topK: request.topK }),
        ...(request.stopSequences && { stopSequences: request.stopSequences })
      }
    });

    try {
      // Call Gemini API with retry logic
      const result = await this.callGeminiWithRetry(() => model.generateContent(request.prompt));
      return result.response.text();
    } catch (error) {
      logger.error({ error }, 'Gemini text generation failed');
      throw new Error(`Gemini text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate text with streaming (optional)
   * Implements ITextProvider.generateStream
   */
  async generateStream(request: GenerateTextRequest & StreamCallback): Promise<void> {
    logger.debug({ temperature: request.temperature }, 'Generating streaming content with Gemini');

    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
        ...(request.topP && { topP: request.topP }),
        ...(request.topK && { topK: request.topK })
      }
    });

    try {
      const result = await model.generateContentStream(request.prompt);

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        request.onChunk(chunkText);
      }

      if (request.onComplete) {
        request.onComplete();
      }
    } catch (error) {
      logger.error({ error }, 'Gemini streaming failed');
      if (request.onError) {
        request.onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw new Error(`Gemini streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Call Gemini API with retry logic for transient failures
   * Private helper method for error handling and retry
   */
  private async callGeminiWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 2
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable (rate limit, temporary failure)
        const errorMsg = lastError.message.toLowerCase();
        const isRetryable =
          errorMsg.includes('rate limit') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('503') ||
          errorMsg.includes('429');

        if (!isRetryable || i === maxRetries - 1) {
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.pow(2, i) * 1000;
        logger.warn({ retry: i + 1, delay }, 'Gemini API call failed, retrying...');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Gemini call failed');
  }
}
