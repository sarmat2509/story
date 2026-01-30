/**
 * Nano Banana Pro Provider - Gemini 2.5 Flash Image Implementation
 * Implements IImageProvider using Google Generative AI SDK
 * 
 * Model: gemini-2.5-flash-image (also known as "Nano Banana")
 * Supports:
 * - Cartoon/illustration styles (better than Imagen 3 for non-photorealistic)
 * - AI-generated images as references (for character consistency)
 * - Up to 14 reference images in one request
 * - Aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IImageProvider, GenerateImageRequest, GeneratedImage } from '../../base/IImageProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

export class NanoBananaProProvider implements IImageProvider {
  private genAI: GoogleGenerativeAI;
  private model: string;
  
  constructor(apiKey?: string) {
    const key = apiKey || config.google.apiKey;
    
    if (!key) {
      throw new Error('Google API Key is required for Nano Banana Pro. Set GOOGLE_API_KEY env var.');
    }
    
    this.genAI = new GoogleGenerativeAI(key);
    this.model = config.nanoBanana?.model || 'gemini-2.5-flash-image';
    
    logger.info({ 
      model: this.model 
    }, 'Nano Banana Pro Provider initialized');
  }
  
  /**
   * Generate image using Gemini 2.5 Flash Image (Nano Banana)
   */
  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    logger.info({ 
      promptLength: request.prompt.length,
      hasReferences: !!request.referenceImages,
      referenceCount: request.referenceImages?.length || 0,
      aspectRatio: request.aspectRatio
    }, 'Generating image with Nano Banana Pro');
    
    try {
      // Get the generative model
      const model = this.genAI.getGenerativeModel({ model: this.model });
      
      // Build content parts array: reference images first, then prompt
      const parts: any[] = [];
      
      // Add reference images if provided
      if (request.referenceImages && request.referenceImages.length > 0) {
        logger.info({ count: request.referenceImages.length }, 'Adding reference images to request');
        
        for (const refImage of request.referenceImages) {
          // Use base64Data if available, otherwise download from URL
          let imageBase64: string;
          let mimeType: string;
          
          if (refImage.base64Data) {
            // Already have base64 data
            imageBase64 = refImage.base64Data;
            mimeType = refImage.mimeType || 'image/png';
            logger.debug('Using provided base64 data for reference');
          } else if (refImage.url) {
            // Download and convert to base64
            const imageBuffer = await this.downloadImage(refImage.url);
            imageBase64 = imageBuffer.toString('base64');
            mimeType = 'image/jpeg';
            logger.debug({ url: refImage.url }, 'Downloaded and converted reference image');
          } else {
            throw new Error('Reference image must have either url or base64Data');
          }
          
          parts.push({
            inlineData: {
              mimeType,
              data: imageBase64
            }
          });
        }
      }
      
      // Add text prompt
      parts.push({ text: request.prompt });
      
      // Configure generation
      const generationConfig: any = {
        responseModalities: ['IMAGE'],
      };
      
      // Add aspect ratio if specified
      if (request.aspectRatio) {
        generationConfig.imageConfig = {
          aspectRatio: request.aspectRatio
        };
      }
      
      // Generate content
      logger.debug({ 
        partsCount: parts.length,
        config: generationConfig 
      }, 'Calling Gemini API');
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig
      });
      
      const response = result.response;
      
      // Check for candidates
      if (!response.candidates || response.candidates.length === 0) {
        logger.error({ response }, 'No candidates in Gemini response');
        throw new Error('No image generated - no candidates in response');
      }
      
      // Find image part in response
      const candidate = response.candidates[0];
      const imagePart = candidate.content.parts.find(p => p.inlineData);
      
      if (!imagePart?.inlineData) {
        logger.error({ candidate }, 'No image data in response');
        throw new Error('No image data in response');
      }
      
      // Decode base64 image
      const imageData = Buffer.from(imagePart.inlineData.data, 'base64');
      
      // Calculate dimensions from aspect ratio
      const dimensions = this.calculateDimensions(request.aspectRatio);
      
      // Determine format from mime type
      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const format = this.getFormatFromMimeType(mimeType);
      
      logger.info({ 
        imageSize: imageData.length,
        mimeType,
        width: dimensions.width,
        height: dimensions.height
      }, 'Image generated successfully');
      
      return {
        imageData,
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        format
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate image with Nano Banana Pro');
      throw new Error(`Nano Banana Pro generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Calculate image dimensions based on aspect ratio
   * Gemini generates up to ~1344x768 for 16:9
   */
  private calculateDimensions(aspectRatio?: string): { width: number; height: number } {
    const dimensionsMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1344, height: 768 },
      '9:16': { width: 768, height: 1344 },
      '4:3': { width: 1024, height: 768 },
      '3:4': { width: 768, height: 1024 },
      '2:3': { width: 768, height: 1152 },
      '3:2': { width: 1152, height: 768 },
      '4:5': { width: 1024, height: 1280 },
      '5:4': { width: 1280, height: 1024 },
      '21:9': { width: 1344, height: 576 },
    };
    
    return dimensionsMap[aspectRatio || '16:9'] || dimensionsMap['16:9'];
  }
  
  /**
   * Get image format from MIME type
   */
  private getFormatFromMimeType(mimeType: string): 'png' | 'jpeg' | 'webp' {
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      return 'jpeg';
    } else if (mimeType.includes('webp')) {
      return 'webp';
    }
    return 'png'; // Default
  }
  
  /**
   * Download image from URL and return as buffer
   * Uses native fetch (Node 18+)
   */
  private async downloadImage(url: string): Promise<Buffer> {
    try {
      logger.debug({ url }, 'Downloading reference image');
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error({ error, url }, 'Failed to download reference image');
      throw new Error(`Failed to download reference image from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
