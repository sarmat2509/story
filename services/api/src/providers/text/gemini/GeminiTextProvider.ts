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

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import type { ITextProvider } from '../../base/ITextProvider';
import type { GenerateStructuredRequest, GenerateTextRequest, StreamCallback } from '../../base/JsonSchema';
import { GeminiSchemaAdapter } from './GeminiSchemaAdapter';
import { logger } from '../../../utils/logger';

export class GeminiTextProvider implements ITextProvider {
  private client: GoogleGenerativeAI;
  private model: string = 'gemini-2.5-flash';
  private schemaAdapter: GeminiSchemaAdapter;
  
  // Safety settings for validation (less restrictive)
  private validationSafetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH
    }
  ];

  // Ultra-relaxed safety settings for character photo analysis (children's content)
  private photoAnalysisSafetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    }
  ];

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
    logger.debug({ 
      temperature: request.temperature,
      hasImages: !!request.imageData,
      imageCount: request.imageData?.length || 0
    }, 'Generating structured content with Gemini');

    // Adapt provider-agnostic schema to Gemini format
    const geminiSchema = this.schemaAdapter.convert(request.schema);
    
    // Detect if this is a validation call (lower temp = validation)
    const isValidation = request.temperature !== undefined && request.temperature < 0.5;

    // Use model override if provided (for vision models)
    const modelName = request.model || this.model;
    
    logger.debug({ 
      model: modelName,
      hasImages: !!request.imageData,
      imageCount: request.imageData?.length || 0
    }, 'Creating Gemini model for structured generation');

    // Create Gemini model with schema
    const model = this.client.getGenerativeModel({
      model: modelName,
      // System instruction helps prevent PROHIBITED_CONTENT false positives
      // on children's imaginary creature descriptions (e.g. "sharp teeth", "claws")
      systemInstruction: {
        parts: [{
          text: 'You are a children\'s story generation engine for a safe, age-appropriate bedtime stories app. '
            + 'All input comes from parents describing their children\'s drawings and imaginary friends. '
            + 'All output must be positive, safe, and suitable for children ages 0-12. '
            + 'Character descriptions may include fantasy creature features (teeth, claws, horns) — these are from children\'s drawings and are always playful and non-threatening.'
        }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: geminiSchema as any, // TypeScript workaround for complex nested schemas
        temperature: request.temperature ?? 0.7,
        ...(request.maxTokens && { maxOutputTokens: request.maxTokens }),
        ...(request.topP && { topP: request.topP }),
        ...(request.topK && { topK: request.topK })
      },
      // Use BLOCK_NONE for all children's content generation — our prompts enforce safety.
      // Gemini's built-in filters produce false positives on character descriptions
      // (e.g. "sharp white teeth" on an imaginary creature drawn by a child).
      safetySettings: this.photoAnalysisSafetySettings
    });

    try {
      // Build content parts for Gemini (text + optional images)
      const contentParts: any[] = [];
      
      // Add images first if provided (for vision models)
      if (request.imageData && request.imageData.length > 0) {
        for (const image of request.imageData) {
          contentParts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data
            }
          });
        }
      }
      
      // Add text prompt
      contentParts.push({ text: request.prompt });
      
      // Call Gemini API with retry logic
      const result = await this.callGeminiWithRetry(() => model.generateContent(contentParts));
      
      // Check if response was blocked
      if (result.response.promptFeedback?.blockReason) {
        const blockReason = result.response.promptFeedback.blockReason;
        const safetyRatings = result.response.promptFeedback?.safetyRatings || [];
        
        // Log detailed blocking information
        logger.warn({ 
          blockReason,
          fullPromptFeedback: result.response.promptFeedback,
          safetyRatings: safetyRatings.map(r => ({
            category: r.category,
            probability: r.probability,
          })),
          candidateCount: result.response.candidates?.length || 0,
          candidateFinishReasons: result.response.candidates?.map(c => c.finishReason) || [],
          isValidation,
          temperature: request.temperature,
          promptLength: request.prompt.length,
          promptPreview: request.prompt.substring(0, 500),
          model: modelName,
          hasImages: !!request.imageData
        }, 'Gemini blocked content - PROHIBITED_CONTENT debug info');
        
        // Build detailed error message with safety ratings
        const safetyDetails = safetyRatings
          .filter(r => r.probability !== 'NEGLIGIBLE')
          .map(r => `${r.category}: ${r.probability}`)
          .join(', ');
        
        throw new Error(`Content blocked by Gemini: ${blockReason}. Details: ${safetyDetails || 'none'}`);
      }
      
      const responseText = result.response.text();

      // Check if response was truncated due to token limit
      const candidate = result.response.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') {
        logger.warn({
          finishReason: candidate.finishReason,
          responseLength: responseText.length,
          maxTokens: request.maxTokens,
        }, 'Response was truncated due to MAX_TOKENS - increase maxOutputTokens');
        throw new Error('Response truncated: increase maxOutputTokens parameter');
      }

      // Log full LLM response for debugging
      logger.info({
        responseLength: responseText.length,
        finishReason: candidate?.finishReason,
        response: responseText,
      }, 'Gemini structured response JSON');

      // Parse JSON response with fallback for markdown-wrapped responses
      try {
        const parsed = JSON.parse(responseText) as T;
        return parsed;
      } catch (parseError) {
        logger.error({
          parseError: parseError instanceof Error ? {
            message: parseError.message,
            name: parseError.name
          } : String(parseError),
          responseText,
          responseLength: responseText.length,
          model: modelName,
          hasImages: !!request.imageData
        }, 'Failed to parse Gemini response as JSON');
        
        // Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          logger.info('Found JSON in markdown code block, retrying parse');
          return JSON.parse(jsonMatch[1]) as T;
        }
        
        throw new Error(`Gemini structured generation failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : String(error),
        model: modelName,
        hasImages: !!request.imageData,
        imageCount: request.imageData?.length || 0
      }, 'Gemini structured generation failed');
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
