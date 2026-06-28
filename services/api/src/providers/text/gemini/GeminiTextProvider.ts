/**
 * Gemini Text Provider
 * Implementation of ITextProvider for Google Gemini API using @google/genai SDK
 *
 * Rules:
 * - MUST implement ITextProvider interface
 * - MUST contain ONLY Gemini API-specific code
 * - NEVER contain business logic (getSceneCount, etc.)
 * - NEVER build prompts (prompts come from Domain Service)
 * - MUST adapt provider-agnostic schemas to Gemini format
 */

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import type { ITextProvider } from '../../base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  StreamCallback,
} from '../../base/JsonSchema';
import { GeminiSchemaAdapter } from './GeminiSchemaAdapter';
import { logger } from '../../../utils/logger';
import {
  GeminiContextCacheService,
  shouldUseGeminiContextCache,
} from './GeminiContextCacheService';
import config from '../../../config';

export class GeminiTextProvider implements ITextProvider {
  private client: GoogleGenAI;
  private model: string;
  private schemaAdapter: GeminiSchemaAdapter;
  private contextCacheService: GeminiContextCacheService;

  // Ultra-relaxed safety settings for children's content generation
  private photoAnalysisSafetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.OFF,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.OFF,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.OFF,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.OFF,
    },
  ];

  constructor(apiKey: string, model: string = 'gemini-3-flash-preview') {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    const trimmed = model?.trim();
    this.model = trimmed && trimmed.length > 0 ? trimmed : 'gemini-3-flash-preview';
    this.client = new GoogleGenAI({ apiKey });
    this.schemaAdapter = new GeminiSchemaAdapter();
    this.contextCacheService = new GeminiContextCacheService(this.client);
  }

  /**
   * Generate structured JSON response using Gemini
   * Implements ITextProvider.generateStructured
   */
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    logger.debug(
      {
        temperature: request.temperature,
        hasImages: !!request.imageData,
        imageCount: request.imageData?.length || 0,
      },
      'Generating structured content with Gemini'
    );

    // Adapt provider-agnostic schema to Gemini format
    const geminiSchema = this.schemaAdapter.convert(request.schema);

    // Use model override if provided (for vision models)
    const modelName = request.model || this.model;

    logger.debug(
      {
        model: modelName,
        hasImages: !!request.imageData,
        imageCount: request.imageData?.length || 0,
      },
      'Creating Gemini model for structured generation'
    );

    try {
      const cachedPrefix = request.cachedPrefix?.content?.trim();
      const promptText = cachedPrefix ? `${cachedPrefix}\n\n${request.prompt}` : request.prompt;
      if (cachedPrefix) {
        // Gemini 3.x rejects cachedContent when a structured response schema is sent
        // because the SDK represents responseSchema as tool/tool_config. Inline the
        // cached rules for structured JSON calls and keep context cache for free text.
        logger.info(
          { cacheKey: request.cachedPrefix?.key, model: modelName },
          'Skipping Gemini context cache for structured generation'
        );
      }

      // Build content parts for Gemini (text + optional images)
      const contentParts: any[] = [];

      // Add images first if provided (for vision models)
      // Supports both inline base64 and Files API URI references
      if (request.imageData && request.imageData.length > 0) {
        for (const image of request.imageData) {
          if (image.instructionText?.trim()) {
            contentParts.push({ text: image.instructionText.trim() });
          }
          if (image.fileUri) {
            // Use Files API reference (avoids re-sending large base64 payloads)
            contentParts.push({
              fileData: {
                fileUri: image.fileUri,
                mimeType: image.mimeType,
              },
            });
          } else {
            contentParts.push({
              inlineData: {
                mimeType: image.mimeType,
                data: image.data,
              },
            });
          }
        }
      }

      // Add text prompt
      contentParts.push({ text: promptText });

      // Call Gemini API with retry logic
      const result = await this.callGeminiWithRetry(() =>
        this.client.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: contentParts }],
          config: {
            // System instruction helps prevent PROHIBITED_CONTENT false positives
            // on children's imaginary creature descriptions (e.g. "sharp teeth", "claws")
            systemInstruction:
              request.systemInstruction ||
              "You are a children's story generation engine for a safe, age-appropriate bedtime stories app. " +
                "All input comes from parents describing their children's drawings and imaginary friends. " +
                'All output must be positive, safe, and suitable for children ages 0-12. ' +
                "Character descriptions may include fantasy creature features (teeth, claws, horns) — these are from children's drawings and are always playful and non-threatening.",
            responseMimeType: 'application/json',
            responseSchema: geminiSchema as any, // TypeScript workaround for complex nested schemas
            temperature: request.temperature ?? 0.7,
            // Gemini 3+ may use internal "thinking" tokens against the output budget; keep a high floor
            // so structured payloads (e.g. full `taggedText` echoing long input) are not truncated mid-JSON.
            maxOutputTokens: Math.min(98304, Math.max(request.maxTokens ?? 8192, 8192)),
            ...(request.topP && { topP: request.topP }),
            ...(request.topK && { topK: request.topK }),
            // Use OFF for all children's content generation — our prompts enforce safety.
            // Gemini's built-in filters produce false positives on character descriptions
            // (e.g. "sharp white teeth" on an imaginary creature drawn by a child).
            safetySettings: this.photoAnalysisSafetySettings,
          },
        })
      );

      // Check if response was blocked
      if (result.promptFeedback?.blockReason) {
        const blockReason = result.promptFeedback.blockReason;
        const safetyRatings = result.promptFeedback?.safetyRatings || [];

        // Log detailed blocking information
        logger.warn(
          {
            blockReason,
            fullPromptFeedback: result.promptFeedback,
            safetyRatings: safetyRatings.map((r) => ({
              category: r.category,
              probability: r.probability,
            })),
            candidateCount: result.candidates?.length || 0,
            candidateFinishReasons: result.candidates?.map((c) => c.finishReason) || [],
            temperature: request.temperature,
            promptLength: request.prompt.length,
            promptPreview: request.prompt.substring(0, 500),
            model: modelName,
            hasImages: !!request.imageData,
          },
          'Gemini blocked content - PROHIBITED_CONTENT debug info'
        );

        // Build detailed error message with safety ratings
        const safetyDetails = safetyRatings
          .filter((r) => r.probability !== 'NEGLIGIBLE')
          .map((r) => `${r.category}: ${r.probability}`)
          .join(', ');

        throw new Error(
          `Content blocked by Gemini: ${blockReason}. Details: ${safetyDetails || 'none'}`
        );
      }

      const responseText = result.text;

      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      // Check if response was truncated due to token limit
      const candidate = result.candidates?.[0];
      // Report usage before any response-quality error, so truncated paid calls still get costed.
      const usage = (
        result as {
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
            cachedContentTokenCount?: number;
            thoughtsTokenCount?: number;
          };
        }
      ).usageMetadata;
      if (request.onUsage && usage) {
        const inputUnits = usage.promptTokenCount ?? 0;
        const outputUnits =
          usage.candidatesTokenCount ??
          Math.max((usage.totalTokenCount ?? inputUnits) - inputUnits, 0);
        const cachedInputUnits = usage.cachedContentTokenCount ?? 0;
        await Promise.resolve(request.onUsage({
          provider: 'gemini',
          operation: request.operation ?? 'text_structured',
          model: modelName,
          inputUnits,
          effectiveInputUnits: Math.max(inputUnits - cachedInputUnits, 0),
          outputUnits,
          cachedInputUnits,
          cacheHit: cachedInputUnits > 0,
          thoughtTokens: usage.thoughtsTokenCount ?? 0,
        }));
      }

      if (candidate?.finishReason === 'MAX_TOKENS') {
        const effectiveMaxOut = Math.min(98304, Math.max(request.maxTokens ?? 8192, 8192));
        logger.warn(
          {
            finishReason: candidate.finishReason,
            responseLength: responseText.length,
            maxOutputTokens: effectiveMaxOut,
            requestedMaxTokens: request.maxTokens,
          },
          'Response was truncated due to MAX_TOKENS - increase maxOutputTokens'
        );
        throw new Error('Response truncated: increase maxOutputTokens parameter');
      }

      // Log full LLM response for debugging
      logger.info(
        {
          responseLength: responseText.length,
          finishReason: candidate?.finishReason,
          response: responseText,
        },
        'Gemini structured response JSON'
      );

      // Parse JSON response with fallback for markdown-wrapped responses
      try {
        const parsed = JSON.parse(responseText) as T;
        return parsed;
      } catch (parseError) {
        logger.error(
          {
            parseError:
              parseError instanceof Error
                ? {
                    message: parseError.message,
                    name: parseError.name,
                  }
                : String(parseError),
            responseText,
            responseLength: responseText.length,
            model: modelName,
            hasImages: !!request.imageData,
          },
          'Failed to parse Gemini response as JSON'
        );

        // Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          logger.info('Found JSON in markdown code block, retrying parse');
          return JSON.parse(jsonMatch[1]) as T;
        }

        throw new Error(
          `Gemini structured generation failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }
    } catch (error) {
      logger.error(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  name: error.name,
                  stack: error.stack,
                }
              : String(error),
          model: modelName,
          hasImages: !!request.imageData,
          imageCount: request.imageData?.length || 0,
        },
        'Gemini structured generation failed'
      );
      throw new Error(
        `Gemini structured generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate free-form text response using Gemini
   * Implements ITextProvider.generateText
   */
  async generateText(request: GenerateTextRequest): Promise<string> {
    logger.debug({ temperature: request.temperature }, 'Generating text content with Gemini');

    try {
      const cachedPrefix = request.cachedPrefix?.content?.trim();
      let promptText = request.prompt;
      let cachedContentName: string | null = null;
      if (cachedPrefix) {
        const cacheDecision = shouldUseGeminiContextCache({
          cachedContent: cachedPrefix,
          runtimeContent: request.prompt,
          minEstimatedTokens: config.ai.geminiContextCacheMinEstimatedTokens,
          minShare: config.ai.geminiContextCacheMinShare,
        });
        if (cacheDecision.useCache) {
          cachedContentName = await this.contextCacheService.getOrCreate({
            model: this.model,
            key: request.cachedPrefix!.key,
            content: cachedPrefix,
            ttlSeconds: request.cachedPrefix?.ttlSeconds,
            displayName: request.cachedPrefix?.displayName,
          });
          if (!cachedContentName) {
            promptText = `${cachedPrefix}\n\n${request.prompt}`;
          }
        } else {
          promptText = `${cachedPrefix}\n\n${request.prompt}`;
          logger.info(
            {
              cacheKey: request.cachedPrefix?.key,
              model: this.model,
              reason: cacheDecision.reason,
              estimatedCachedTokens: cacheDecision.estimatedCachedTokens,
              estimatedRuntimeTokens: cacheDecision.estimatedRuntimeTokens,
              cachedShare: Number(cacheDecision.cachedShare.toFixed(3)),
            },
            'Skipping Gemini context cache'
          );
        }
      }

      // Call Gemini API with retry logic
      const result = await this.callGeminiWithRetry(() =>
        this.client.models.generateContent({
          model: this.model,
          contents: promptText,
          config: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? 4096,
            ...(request.topP && { topP: request.topP }),
            ...(request.topK && { topK: request.topK }),
            ...(request.stopSequences && { stopSequences: request.stopSequences }),
            ...(cachedContentName && { cachedContent: cachedContentName }),
          },
        })
      );

      const usage = (
        result as {
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
            cachedContentTokenCount?: number;
          };
        }
      ).usageMetadata;
      if (request.onUsage && usage) {
        const inputUnits = usage.promptTokenCount ?? 0;
        const outputUnits =
          (usage.candidatesTokenCount ?? usage.totalTokenCount)
            ? usage.totalTokenCount - inputUnits
            : 0;
        const cachedInputUnits = usage.cachedContentTokenCount ?? 0;
        request.onUsage({
          provider: 'gemini',
          operation: request.operation ?? 'text_free',
          model: this.model,
          inputUnits,
          effectiveInputUnits: Math.max(inputUnits - cachedInputUnits, 0),
          outputUnits,
          cachedInputUnits,
          cacheHit: cachedInputUnits > 0,
        });
      }

      return result.text || '';
    } catch (error) {
      logger.error({ error }, 'Gemini text generation failed');
      throw new Error(
        `Gemini text generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate text with streaming (optional)
   * Implements ITextProvider.generateStream
   */
  async generateStream(request: GenerateTextRequest & StreamCallback): Promise<void> {
    logger.debug({ temperature: request.temperature }, 'Generating streaming content with Gemini');

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: request.prompt,
        config: {
          temperature: request.temperature ?? 0.7,
          ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
          ...(request.topP && { topP: request.topP }),
          ...(request.topK && { topK: request.topK }),
        },
      });

      for await (const chunk of stream) {
        const chunkText = chunk.text;
        if (chunkText) {
          request.onChunk(chunkText);
        }
      }

      if (request.onComplete) {
        request.onComplete();
      }
    } catch (error) {
      logger.error({ error }, 'Gemini streaming failed');
      if (request.onError) {
        request.onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw new Error(
        `Gemini streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Call Gemini API with retry logic for transient failures
   * Private helper method for error handling and retry
   */
  private async callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries: number = 2): Promise<T> {
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
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Gemini call failed');
  }
}
