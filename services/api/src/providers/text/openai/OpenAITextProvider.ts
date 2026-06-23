/**
 * OpenAI Text Provider
 * Implementation of ITextProvider for OpenAI API (GPT-5.2 and compatible models)
 * 
 * Rules:
 * - MUST implement ITextProvider interface
 * - MUST contain ONLY OpenAI API-specific code
 * - NEVER contain business logic (getSceneCount, etc.)
 * - NEVER build prompts (prompts come from Domain Service)
 * - MUST adapt provider-agnostic schemas to OpenAI format
 */

import OpenAI from 'openai';
import type { ITextProvider } from '../../base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest, StreamCallback } from '../../base/JsonSchema';
import { OpenAISchemaAdapter } from './OpenAISchemaAdapter';
import { logger } from '../../../utils/logger';

export class OpenAITextProvider implements ITextProvider {
  private client: OpenAI;
  private model: string;
  private schemaAdapter: OpenAISchemaAdapter;

  constructor(apiKey: string, model: string = 'gpt-5.2') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.schemaAdapter = new OpenAISchemaAdapter();
    
    logger.info({ model: this.model }, 'OpenAI Text Provider initialized');
  }

  private buildPromptCacheKey(request: GenerateStructuredRequest<unknown>, modelName: string): string | undefined {
    const key = request.cachedPrefix?.key?.trim();
    if (!key) return undefined;
    return `${modelName}:${key}`;
  }

  /**
   * Generate structured JSON response using OpenAI
   * Implements ITextProvider.generateStructured
   */
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    const startTime = Date.now();
    const modelName = request.model || this.model;
    const effectivePrompt = request.cachedPrefix?.content?.trim()
      ? `${request.cachedPrefix.content.trim()}\n\n${request.prompt}`
      : request.prompt;
    const promptCacheKey = this.buildPromptCacheKey(request, modelName);

    logger.debug({
      model: modelName,
      temperature: request.temperature,
      hasImages: !!request.imageData,
      imageCount: request.imageData?.length || 0,
      promptLength: effectivePrompt.length,
      promptCacheKey,
    }, 'Generating structured content with OpenAI');

    // Adapt provider-agnostic schema to OpenAI format
    const openaiSchema = this.schemaAdapter.convert(request.schema);

    try {
      // Build message content (text + optional images for vision)
      const content = this.buildMessageContent(effectivePrompt, request.imageData);
      const messages: Array<any> = request.systemInstruction?.trim()
        ? [
            { role: 'system', content: request.systemInstruction.trim() },
            { role: 'user', content },
          ]
        : [{ role: 'user', content }];

      // Call OpenAI API with retry logic
      const response = await this.callWithRetry(async () => {
        return await this.client.chat.completions.create({
          model: modelName,
          messages,
          temperature: request.temperature ?? 0.9,
          ...(request.maxTokens && { max_tokens: request.maxTokens }),
          ...(request.topP && { top_p: request.topP }),
          ...(promptCacheKey && { prompt_cache_key: promptCacheKey }),
          ...(promptCacheKey && { prompt_cache_retention: '24h' }),
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              schema: openaiSchema,
              strict: true,
            },
          },
        });
      });

      const duration = Date.now() - startTime;
      const responseText = response.choices[0]?.message?.content;
      const finishReason = response.choices[0]?.finish_reason;
      const usage = response.usage;

      // Check for truncation
      if (finishReason === 'length') {
        logger.warn({
          finishReason,
          responseLength: responseText?.length,
          maxTokens: request.maxTokens,
          duration,
        }, 'OpenAI response was truncated due to max_tokens');
        throw new Error('Response truncated: increase max_tokens parameter');
      }

      // Check for content filter
      if (finishReason === 'content_filter') {
        logger.warn({
          finishReason,
          model: modelName,
          duration,
        }, 'OpenAI response blocked by content filter');
        throw new Error('Content blocked by OpenAI content filter');
      }

      if (!responseText) {
        throw new Error('OpenAI returned empty response');
      }

      logger.debug({
        responseLength: responseText.length,
        finishReason,
        duration,
        promptTokens: usage?.prompt_tokens,
        cachedPromptTokens: (usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
          ?.prompt_tokens_details?.cached_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        model: modelName,
      }, 'OpenAI structured response received');

      if (request.onUsage && usage) {
        const cachedInputUnits =
          (usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens ?? 0;
        const inputUnits = usage.prompt_tokens ?? 0;
        request.onUsage({
          provider: 'openai',
          operation: request.operation ?? 'text_structured',
          model: modelName,
          inputUnits,
          effectiveInputUnits: Math.max(inputUnits - cachedInputUnits, 0),
          outputUnits: usage.completion_tokens ?? 0,
          cachedInputUnits,
          cacheHit: cachedInputUnits > 0,
        });
      }

      // Parse JSON response
      try {
        const parsed = JSON.parse(responseText) as T;
        return parsed;
      } catch (parseError) {
        logger.error({
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          responseText: responseText.substring(0, 500),
          responseLength: responseText.length,
          model: modelName,
        }, 'Failed to parse OpenAI response as JSON');

        // Try to extract JSON from markdown code blocks (fallback)
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          logger.info('Found JSON in markdown code block, retrying parse');
          return JSON.parse(jsonMatch[1]) as T;
        }

        throw new Error(`OpenAI structured generation failed: invalid JSON response`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack,
        } : String(error),
        model: modelName,
        duration,
        hasImages: !!request.imageData,
        imageCount: request.imageData?.length || 0,
      }, 'OpenAI structured generation failed');
      throw new Error(`OpenAI structured generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate free-form text response using OpenAI
   * Implements ITextProvider.generateText
   */
  async generateText(request: GenerateTextRequest): Promise<string> {
    logger.debug({ temperature: request.temperature }, 'Generating text content with OpenAI');

    try {
      const effectivePrompt = request.cachedPrefix?.content?.trim()
        ? `${request.cachedPrefix.content.trim()}\n\n${request.prompt}`
        : request.prompt;
      const promptCacheKey = request.cachedPrefix?.key?.trim()
        ? `${this.model}:${request.cachedPrefix.key.trim()}`
        : undefined;
      const response = await this.callWithRetry(async () => {
        return await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: effectivePrompt }],
          temperature: request.temperature ?? 0.7,
          ...(request.maxTokens && { max_tokens: request.maxTokens }),
          ...(request.topP && { top_p: request.topP }),
          ...(request.stopSequences && { stop: request.stopSequences }),
          ...(promptCacheKey && { prompt_cache_key: promptCacheKey }),
          ...(promptCacheKey && { prompt_cache_retention: '24h' }),
        });
      });

      const usage = response.usage;
      if (request.onUsage && usage) {
        const cachedInputUnits =
          (usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens ?? 0;
        const inputUnits = usage.prompt_tokens ?? 0;
        request.onUsage({
          provider: 'openai',
          operation: request.operation ?? 'text_free',
          model: this.model,
          inputUnits,
          effectiveInputUnits: Math.max(inputUnits - cachedInputUnits, 0),
          outputUnits: usage.completion_tokens ?? 0,
          cachedInputUnits,
          cacheHit: cachedInputUnits > 0,
        });
      }

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error({ error }, 'OpenAI text generation failed');
      throw new Error(`OpenAI text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate text with streaming
   * Implements ITextProvider.generateStream
   */
  async generateStream(request: GenerateTextRequest & StreamCallback): Promise<void> {
    logger.debug({ temperature: request.temperature }, 'Generating streaming content with OpenAI');

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature ?? 0.7,
        ...(request.maxTokens && { max_tokens: request.maxTokens }),
        ...(request.topP && { top_p: request.topP }),
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          request.onChunk(content);
        }
      }

      if (request.onComplete) {
        request.onComplete();
      }
    } catch (error) {
      logger.error({ error }, 'OpenAI streaming failed');
      if (request.onError) {
        request.onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw new Error(`OpenAI streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build message content array for OpenAI (text + optional images)
   * Supports vision models when imageData is provided
   */
  private buildMessageContent(
    prompt: string,
    imageData?: Array<{ mimeType: string; data: string; instructionText?: string }>
  ): string | Array<any> {
    if (!imageData || imageData.length === 0) {
      return prompt;
    }

    // Build multimodal content array for vision
    const content: Array<any> = [];

    // Add images first (same order as Gemini provider)
    for (const image of imageData) {
      if (image.instructionText?.trim()) {
        content.push({
          type: 'text',
          text: image.instructionText.trim(),
        });
      }
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.data}`,
          detail: 'high',
        },
      });
    }

    // Add text prompt
    content.push({
      type: 'text',
      text: prompt,
    });

    return content;
  }

  /**
   * Call OpenAI API with retry logic for transient failures
   */
  private async callWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 2
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const errorMsg = lastError.message.toLowerCase();
        const isRetryable =
          errorMsg.includes('rate limit') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('503') ||
          errorMsg.includes('429') ||
          errorMsg.includes('server_error') ||
          errorMsg.includes('overloaded');

        if (!isRetryable || i === maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.pow(2, i) * 1000;
        logger.warn({ retry: i + 1, delay, error: errorMsg }, 'OpenAI API call failed, retrying...');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('OpenAI call failed');
  }
}
