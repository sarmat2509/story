/**
 * Gemini Image Provider - Imagen 3 Implementation
 * Implementation of IImageProvider for Google Imagen 3
 */

import type { IImageProvider, GenerateImageRequest, GeneratedImage } from '../../base/IImageProvider';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { getImageRateLimiter } from '../../../services/aiService';

interface ImagenGenerationConfig {
  aspectRatio?: string;
  negativePrompt?: string;
  numberOfImages?: number;
  seed?: number;
  guidanceScale?: number;
}

/**
 * GeminiImageProvider - Imagen 3 provider
 * 
 * Uses Google Generative AI SDK for Imagen 3 image generation
 * Supports:
 * - Text-to-image generation
 * - Reference images for character consistency (if API supports)
 * - Multiple aspect ratios
 * - Safety filters
 * - Retry logic with exponential backoff
 */
export class GeminiImageProvider implements IImageProvider {
  private genAI: GoogleGenerativeAI;
  private maxRetries: number;
  private retryDelayMs: number;
  private rateLimiter = getImageRateLimiter();

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.maxRetries = config.image.maxRetries;
    this.retryDelayMs = config.image.retryDelayMs;
    
    logger.info('Gemini Image Provider initialized with Imagen 3 and rate limiting');
  }

  /**
   * Generate image using Imagen 3
   * Implements retry logic with exponential backoff
   */
  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(
          { 
            prompt: request.prompt.substring(0, 100), 
            aspectRatio: request.aspectRatio,
            hasReferences: !!request.referenceImages?.length,
            attempt: attempt + 1
          },
          'Generating image with Imagen 3'
        );
        
        const result = await this.generateImageInternal(request);
        
        logger.info(
          { 
            size: result.imageData.length, 
            format: result.format,
            attempt: attempt + 1 
          },
          'Image generated successfully'
        );
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable
        if (this.isRetryableError(error) && attempt < this.maxRetries - 1) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          logger.warn(
            { error: error.message, attempt: attempt + 1, delayMs: delay },
            'Image generation failed, retrying...'
          );
          await this.sleep(delay);
          continue;
        }
        
        // Non-retryable error or max retries reached
        logger.error(
          { error, attempt: attempt + 1 },
          'Image generation failed permanently'
        );
        throw error;
      }
    }
    
    throw lastError || new Error('Image generation failed after all retries');
  }

  /**
   * Internal method to generate image (called by retry logic)
   * Wrapped with rate limiter to control RPM
   */
  private async generateImageInternal(request: GenerateImageRequest): Promise<GeneratedImage> {
    // Execute through rate limiter
    return await this.rateLimiter.execute(async () => {
      // Build generation config
      const generationConfig: ImagenGenerationConfig = {
        aspectRatio: this.mapAspectRatio(request.aspectRatio),
        negativePrompt: request.negativePrompt,
        numberOfImages: 1,
      };
      
      if (request.seed !== undefined) {
        generationConfig.seed = request.seed;
      }
      
      if (request.guidanceScale !== undefined) {
        generationConfig.guidanceScale = request.guidanceScale;
      }
      
      // For MVP, we use text-to-image model
      // NOTE: Reference images support depends on Imagen 3 API capabilities
      // If not supported by API, caller should analyze references and add to prompt
      const model = this.genAI.getGenerativeModel({
        model: config.image.gemini.model,
      });
      
      try {
        // Create timeout promise (2 minutes for generation only, not including queue time)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Image generation timeout after 120 seconds')), 120000)
        );
        
        // Create generation promise
        const generationPromise = model.generateContent({
          contents: [{
            role: 'user',
            parts: [{ text: request.prompt }]
          }],
          generationConfig: generationConfig as any,
        });
        
        // Race between generation and timeout
        const result = await Promise.race([generationPromise, timeoutPromise]);
        
        // Extract image data from response
        // NOTE: The actual response structure may vary
        // This is a placeholder that needs to be adjusted based on actual API
        await result.response; // Ensure response is awaited
        
        // For MVP, throw error with guidance for implementation
        throw new Error(
          'Imagen 3 API integration pending. ' +
          'The @google/generative-ai SDK may not directly support Imagen 3. ' +
          'Consider using Vertex AI SDK with proper authentication. ' +
          'See: https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images'
        );
        
        // TODO: Implement actual image extraction when API is available
        // Expected implementation:
        // const imageData = Buffer.from(response.image.data, 'base64');
        // return {
        //   imageData,
        //   mimeType: 'image/png',
        //   width: request.width || 1024,
        //   height: request.height || 576,
        //   format: 'png',
        //   seed: generationConfig.seed,
        // };
        
      } catch (error: any) {
        logger.error({ 
          error: error.message, 
          prompt: request.prompt.substring(0, 100),
          stack: error.stack 
        }, 'Imagen 3 API call failed');
        throw new Error(`Image generation failed: ${error.message}`);
      }
    });
  }

  /**
   * Generate multiple image variations
   * Future: Implement batch generation for efficiency
   */
  async generateImages(request: GenerateImageRequest & { count: number }): Promise<GeneratedImage[]> {
    logger.info({ count: request.count }, 'Generating multiple images with Imagen 3');
    
    // For MVP, generate sequentially
    const images: GeneratedImage[] = [];
    for (let i = 0; i < request.count; i++) {
      const image = await this.generateImage(request);
      images.push(image);
    }
    
    return images;
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Map aspect ratio to Imagen 3 format
   */
  private mapAspectRatio(ratio?: string): string {
    const mapping: Record<string, string> = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
    };
    
    return mapping[ratio || '16:9'] || '16:9';
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableMessages = [
      'rate limit',
      'quota exceeded',
      'timeout',
      'temporarily unavailable',
      'internal server error',
      '429', // Too Many Requests
      '500', // Internal Server Error
      '503', // Service Unavailable
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

