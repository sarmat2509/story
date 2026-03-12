/**
 * Gemini Image Provider - Imagen 3 Implementation
 * Implements IImageProvider using Vertex AI REST API for Imagen 3
 * 
 * Supports two models:
 * - imagen-3.0-generate-002: Basic model for text-to-image (supports aspectRatio)
 * - imagen-3.0-capability-001: Customization model for reference images (no aspectRatio support)
 */

import type { IImageProvider, GenerateImageRequest, GeneratedImage, ReferenceImage } from '../../base/IImageProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { getImageRateLimiter } from '../../../services/aiService';
import { GoogleAuth } from 'google-auth-library';

interface VertexAIImageResponse {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
}

interface ReferenceImageConfig {
  referenceType: 'REFERENCE_TYPE_SUBJECT' | 'REFERENCE_TYPE_CONTROL';
  referenceId: number;
  referenceImage: {
    bytesBase64Encoded: string;
  };
  subjectImageConfig: {
    subjectDescription: string;
    subjectType: 'SUBJECT_TYPE_PERSON' | 'SUBJECT_TYPE_PRODUCT' | 'SUBJECT_TYPE_ANIMAL';
  };
}

/**
 * GeminiImageProvider - Imagen 3 provider using Vertex AI REST API
 * 
 * Flow selection:
 * - If referenceImages provided → use imagen-3.0-capability-001
 * - Otherwise → use imagen-3.0-generate-002
 */
export class GeminiImageProvider implements IImageProvider {
  private auth: GoogleAuth;
  private maxRetries: number;
  private retryDelayMs: number;
  private rateLimiter = getImageRateLimiter();
  private projectId: string;
  private location: string;

  constructor(apiKey?: string) {
    this.projectId = config.image.gemini.projectId;
    this.location = config.image.gemini.location;
    
    if (!this.projectId) {
      throw new Error('Google Cloud Project ID is required for Imagen 3. Set GOOGLE_CLOUD_PROJECT env var.');
    }
    
    // Initialize Google Auth for Vertex AI
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      // If GOOGLE_APPLICATION_CREDENTIALS is set, it will be used automatically
      // Otherwise, falls back to Application Default Credentials
    });
    
    this.maxRetries = config.image.maxRetries;
    this.retryDelayMs = config.image.retryDelayMs;
    
    logger.info({ 
      projectId: this.projectId, 
      location: this.location 
    }, 'Gemini Image Provider initialized with Vertex AI REST API');
  }

  /**
   * Generate image using Imagen 3
   * Implements retry logic with exponential backoff
   */
  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const hasReferences = request.referenceImages && request.referenceImages.length > 0;
        
        logger.info(
          { 
            prompt: request.prompt.substring(0, 100), 
            aspectRatio: request.aspectRatio,
            hasReferences,
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
   * Truncate base64 strings in objects for logging
   * Prevents huge log files from base64-encoded images
   */
  private truncateBase64(obj: any, maxLength: number = 300): any {
    if (typeof obj === 'string' && obj.length > maxLength) {
      return obj.substring(0, maxLength) + `... (${obj.length} chars total)`;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.truncateBase64(item, maxLength));
    }
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key.includes('base64') || key.includes('Base64') || key.includes('bytesBase64')) {
          result[key] = this.truncateBase64(value, maxLength);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }

  /**
   * Internal method to generate image (called by retry logic)
   * Wrapped with rate limiter to control RPM
   */
  private async generateImageInternal(request: GenerateImageRequest): Promise<GeneratedImage> {
    // Execute through rate limiter
    return await this.rateLimiter.execute(async () => {
      const hasReferences = request.referenceImages && request.referenceImages.length > 0;
      
      // Select model based on whether we have reference images
      const modelName = hasReferences 
        ? 'imagen-3.0-capability-001'  // Supports reference images, NO aspectRatio
        : 'imagen-3.0-generate-002';   // Supports aspectRatio, NO reference images
      
      logger.debug({ 
        modelName, 
        hasReferences,
        referenceCount: request.referenceImages?.length || 0
      }, 'Selected Imagen model');
      
      try {
        // Get access token
        const client = await this.auth.getClient();
        const accessToken = await client.getAccessToken();
        
        if (!accessToken.token) {
          throw new Error('Failed to obtain access token for Vertex AI');
        }
        
        // Build request based on model type
        let requestBody: any;
        
        if (hasReferences) {
          // Capability model: with reference images
          const convertedRefs = await this.convertReferenceImages(request.referenceImages!);
          
          requestBody = {
            instances: [{
              prompt: request.prompt,
              referenceImages: convertedRefs,
            }],
            parameters: {
              sampleCount: 1,
              ...(request.personGeneration && { personGeneration: request.personGeneration }),
              // Note: aspectRatio NOT supported in capability model
            },
          };
        } else {
          // Generate model: without reference images, with aspectRatio
          requestBody = {
            instances: [{
              prompt: request.prompt,
            }],
            parameters: {
              sampleCount: 1,
              aspectRatio: request.aspectRatio || '16:9',
              ...(request.personGeneration && { personGeneration: request.personGeneration }),
            },
          };
        }
        
        // Log the request for debugging
        logger.debug({ 
          modelName,
          personGeneration: requestBody.parameters?.personGeneration,
          hasAspectRatio: !!requestBody.parameters?.aspectRatio,
          hasReferenceImages: hasReferences,
        }, 'Sending request to Vertex AI');
        
        // Make REST API call to Vertex AI
        const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${modelName}:predict`;
        
        logger.debug({ endpoint, bodySize: JSON.stringify(requestBody).length }, 'Calling Vertex AI Imagen API');
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          logger.error({ 
            status: response.status, 
            statusText: response.statusText, 
            error: errorText,
            requestBody: this.truncateBase64(requestBody, 300),
          }, 'Vertex AI API request failed');
          
          throw new Error(`Vertex AI API error (${response.status}): ${errorText}`);
        }
        
        const data = await response.json() as VertexAIImageResponse;
        
        // Log the full response for debugging (with truncated base64)
        logger.debug({
          hasPredictions: !!data.predictions,
          predictionCount: data.predictions?.length || 0,
          fullResponse: this.truncateBase64(data, 300),
        }, 'Vertex AI API response received');
        
        if (!data.predictions || data.predictions.length === 0) {
          logger.error({
            response: this.truncateBase64(data, 300),
            requestBody: this.truncateBase64(requestBody, 300),
          }, 'Empty predictions array - content may have been blocked by safety filters');
          
          throw new Error('No image predictions returned from Vertex AI (content may be blocked by safety filters)');
        }
        
        const prediction = data.predictions[0];
        
        // Decode base64 image
        const imageData = Buffer.from(prediction.bytesBase64Encoded, 'base64');
        
        // Determine dimensions based on aspect ratio
        const dimensions = this.calculateDimensions(request.aspectRatio, hasReferences);

        // Report usage for cost tracking (Imagen 3 flat rate per image)
        const modelName = hasReferences ? 'imagen-3.0-capability-001' : 'imagen-3.0-generate-002';
        request.onUsage?.({
          provider: 'gemini',
          operation: request.operation || 'image_generate',
          model: modelName,
          inputUnits: 1,
        });
        
        return {
          imageData,
          mimeType: prediction.mimeType || 'image/png',
          width: dimensions.width,
          height: dimensions.height,
          format: this.getMimeFormat(prediction.mimeType),
        };
        
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
   * Convert reference images from URLs to base64-encoded format
   */
  private async convertReferenceImages(refs: ReferenceImage[]): Promise<ReferenceImageConfig[]> {
    const converted: ReferenceImageConfig[] = [];
    
    for (let i = 0; i < Math.min(refs.length, 4); i++) { // Max 4 references
      const ref = refs[i];
      
      try {
        // Download image from URL
        const imageBuffer = await this.downloadImage(ref.url);
        const base64 = imageBuffer.toString('base64');
        
        converted.push({
          referenceType: 'REFERENCE_TYPE_SUBJECT',
          referenceId: i + 1, // 1-indexed for prompt references like [1], [2], etc.
          referenceImage: {
            bytesBase64Encoded: base64,
          },
          subjectImageConfig: {
            subjectDescription: ref.subjectDescription || ref.characterName || 'character',
            subjectType: ref.subjectType || 'SUBJECT_TYPE_PERSON',
          },
        });
        
        logger.debug({ 
          referenceId: i + 1, 
          characterName: ref.characterName,
          imageSize: imageBuffer.length 
        }, 'Converted reference image');
        
      } catch (error: any) {
        logger.warn({ 
          error: error.message, 
          url: ref.url,
          characterName: ref.characterName 
        }, 'Failed to download reference image, skipping');
        // Continue with other references
      }
    }
    
    if (converted.length === 0) {
      logger.warn('No reference images could be converted, will generate without references');
    }
    
    return converted;
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
      
    } catch (error: any) {
      logger.error({ error: error.message, url }, 'Image download failed');
      throw new Error(`Failed to download reference image from ${url}: ${error.message}`);
    }
  }

  /**
   * Calculate dimensions based on aspect ratio
   */
  private calculateDimensions(
    aspectRatio?: string, 
    isCapabilityModel: boolean = false
  ): { width: number; height: number } {
    // Capability model returns default size (usually 1024x1024 or similar)
    // We'll use 1024x1024 as default for capability model
    if (isCapabilityModel) {
      return { width: 1024, height: 1024 };
    }
    
    // For generate model, use aspect ratio
    const dimensionsMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1024, height: 576 },
      '9:16': { width: 576, height: 1024 },
      '4:3': { width: 1024, height: 768 },
      '3:4': { width: 768, height: 1024 },
    };
    
    return dimensionsMap[aspectRatio || '16:9'] || dimensionsMap['16:9'];
  }

  /**
   * Extract format from MIME type
   */
  private getMimeFormat(mimeType?: string): 'png' | 'jpeg' | 'webp' {
    if (!mimeType) return 'png';
    
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg';
    if (mimeType.includes('webp')) return 'webp';
    return 'png';
  }

  /**
   * Generate multiple image variations
   */
  async generateImages(request: GenerateImageRequest & { count: number }): Promise<GeneratedImage[]> {
    logger.info({ count: request.count }, 'Generating multiple images with Imagen 3');
    
    // Generate sequentially (parallel not recommended due to rate limits)
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
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableMessages = [
      'rate limit',
      'quota exceeded',
      'timeout',
      'temporarily unavailable',
      'internal server error',
      'ECONNRESET',
      'ETIMEDOUT',
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

