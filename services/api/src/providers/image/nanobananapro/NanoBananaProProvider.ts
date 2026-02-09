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
    // Log full prompt details BEFORE API call
    logger.info({ 
      promptLength: request.prompt.length,
      promptCharCount: request.prompt.length,
      promptWordCount: request.prompt.split(/\s+/).length,
      hasReferences: !!request.referenceImages,
      referenceCount: request.referenceImages?.length || 0,
      aspectRatio: request.aspectRatio,
      model: this.model,
      // Log prompt sections for debugging
      promptBreakdown: {
        first500chars: request.prompt.substring(0, 500),
        middle500chars: request.prompt.substring(
          Math.max(0, Math.floor(request.prompt.length / 2) - 250),
          Math.floor(request.prompt.length / 2) + 250
        ),
        last500chars: request.prompt.substring(Math.max(0, request.prompt.length - 500)),
      }
    }, 'Generating image with Nano Banana Pro - Full Request Details');
    
    try {
      // Get the generative model
      const model = this.genAI.getGenerativeModel({ model: this.model });
      
      // Build content parts array: reference images first, then prompt
      const parts: any[] = [];
      
      // Add reference images if provided
      if (request.referenceImages && request.referenceImages.length > 0) {
        logger.info({ 
          count: request.referenceImages.length,
          references: request.referenceImages.map(ref => ({
            hasUrl: !!ref.url,
            hasBase64: !!ref.base64Data,
            characterName: ref.characterName,
            mimeType: ref.mimeType,
            urlPreview: ref.url ? ref.url.substring(0, 100) : undefined,
            base64Length: ref.base64Data?.length || 0,
          }))
        }, 'Adding reference images to request');
        
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
      logger.info({ 
        partsCount: parts.length,
        partsStructure: parts.map((p, idx) => {
          if (p.inlineData) {
            return {
              index: idx,
              type: 'image',
              mimeType: p.inlineData.mimeType,
              dataLength: p.inlineData.data.length,
            };
          }
          return {
            index: idx,
            type: 'text',
            textLength: p.text?.length || 0,
            textPreview: p.text?.substring(0, 100),
          };
        }),
        generationConfig,
        model: this.model,
      }, 'Calling Gemini API with full request details');
      
      // Count tokens before generation (optional but helpful for diagnostics)
      try {
        const tokenCountResult = await model.countTokens({ 
          contents: [{ role: 'user', parts }] 
        });

        logger.info({
          promptLength: request.prompt.length,
          totalTokens: tokenCountResult.totalTokens,
          maxInputTokens: 32768,
          tokenUtilization: `${((tokenCountResult.totalTokens / 32768) * 100).toFixed(1)}%`
        }, 'Token count for image generation');

        if (tokenCountResult.totalTokens > 30000) {
          logger.warn({
            totalTokens: tokenCountResult.totalTokens,
            limit: 32768,
            excess: tokenCountResult.totalTokens - 30000
          }, 'Prompt approaching token limit (>90%)');
        }
      } catch (tokenError) {
        logger.debug({ error: tokenError }, 'Could not count tokens (non-critical)');
      }
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig
      });
      
      const response = result.response;
      
      // Log complete response structure
      logger.info({
        hasCandidates: !!response.candidates,
        candidateCount: response.candidates?.length || 0,
        hasPromptFeedback: !!response.promptFeedback,
        promptFeedbackBlockReason: response.promptFeedback?.blockReason,
        usageMetadata: response.usageMetadata,
        candidatesSummary: response.candidates?.map(c => ({
          finishReason: c.finishReason,
          hasContent: !!c.content,
          hasSafetyRatings: !!c.safetyRatings,
          safetyRatingsCount: c.safetyRatings?.length || 0,
        })),
      }, 'Received response from Gemini API');
      
      // Check if prompt was blocked (before candidates)
      if (response.promptFeedback?.blockReason) {
        const blockReason = response.promptFeedback.blockReason;
        const safetyRatings = response.promptFeedback?.safetyRatings || [];
        
        logger.error({ 
          blockReason,
          safetyRatings: safetyRatings.map(r => ({
            category: r.category,
            probability: r.probability,
          })),
          promptLength: request.prompt.length,
          promptPreview: request.prompt.substring(0, 200),
          hasReferences: !!request.referenceImages,
          referenceCount: request.referenceImages?.length || 0
        }, 'Gemini blocked image generation prompt');
        
        const safetyDetails = safetyRatings
          .filter(r => r.probability !== 'NEGLIGIBLE')
          .map(r => `${r.category}: ${r.probability}`)
          .join(', ');
        
        throw new Error(`Image generation blocked by Gemini: ${blockReason}. Details: ${safetyDetails || 'none'}`);
      }
      
      // Check for candidates
      if (!response.candidates || response.candidates.length === 0) {
        logger.error({ 
          response,
          promptLength: request.prompt.length,
          hasReferences: !!request.referenceImages
        }, 'No candidates in Gemini response');
        throw new Error('No image generated - no candidates in response');
      }
      
      // Find image part in response
      const candidate = response.candidates[0];
      
      // Validate candidate structure
      if (!candidate.content) {
        logger.error({ 
          candidate,
          finishReason: candidate.finishReason,
          safetyRatings: candidate.safetyRatings,
          promptLength: request.prompt.length,
          hasReferences: !!request.referenceImages,
          referenceCount: request.referenceImages?.length || 0
        }, 'Candidate has no content - likely blocked or filtered');
        
        // Special handling for NO_IMAGE
        if (candidate.finishReason === 'NO_IMAGE') {
          throw new Error(
            `Gemini 2.5 Flash Image could not generate an image. ` +
            `This may occur due to: ` +
            `1) Prompt too long (current: ${request.prompt.length} chars), ` +
            `2) Too many reference images (current: ${request.referenceImages?.length || 0}, max: 3), ` +
            `3) Unsupported content in prompt. ` +
            `Try simplifying the prompt or reducing reference images.`
          );
        }
        
        throw new Error(`No image content in candidate. Finish reason: ${candidate.finishReason || 'unknown'}`);
      }
      
      if (!candidate.content.parts || !Array.isArray(candidate.content.parts)) {
        logger.error({ 
          candidate,
          contentType: typeof candidate.content
        }, 'Candidate content has no parts array');
        
        throw new Error('Invalid candidate structure - no parts array in content');
      }
      
      const imagePart = candidate.content.parts.find(p => p.inlineData);
      
      if (!imagePart?.inlineData) {
        logger.error({ 
          candidate,
          partsCount: candidate.content.parts.length,
          partTypes: candidate.content.parts.map(p => Object.keys(p))
        }, 'No image data in response parts');
        
        throw new Error('No image data in response - parts array contains no inlineData');
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
