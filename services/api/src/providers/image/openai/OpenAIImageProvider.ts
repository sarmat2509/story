/**
 * OpenAI Image Provider - GPT Image via Responses API
 * Implements IImageProvider using OpenAI's Responses API with image_generation tool.
 *
 * Uses interleaved input_text + input_image content blocks for character consistency,
 * mirroring the approach used by NanoBananaProProvider with Gemini.
 *
 * Reference: https://developers.openai.com/api/docs/guides/image-generation
 */

import OpenAI from 'openai';
import type {
  ResponseInputContent,
  ResponseOutputItem,
  Tool,
} from 'openai/resources/responses/responses';
import type { IImageProvider, GenerateImageRequest, GeneratedImage } from '../../base/IImageProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

export class OpenAIImageProvider implements IImageProvider {
  private client: OpenAI;
  private mainlineModel: string;
  private quality: 'low' | 'medium' | 'high' | 'auto';

  constructor(apiKey?: string) {
    const key = apiKey || config.ai.openaiApiKey;

    if (!key) {
      throw new Error('OpenAI API Key is required for OpenAI Image Provider. Set OPENAI_API_KEY env var.');
    }

    this.client = new OpenAI({ apiKey: key });
    this.mainlineModel = config.openaiImage?.mainlineModel || 'gpt-4.1';
    this.quality = (config.openaiImage?.quality as 'low' | 'medium' | 'high' | 'auto') || 'medium';

    logger.info({
      mainlineModel: this.mainlineModel,
      quality: this.quality,
    }, 'OpenAI Image Provider initialized');
  }

  /**
   * Generate image using OpenAI Responses API with image_generation tool
   */
  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    const hasReferences = !!request.referenceImages && request.referenceImages.length > 0;
    const size = this.mapAspectRatio(request.aspectRatio);

    logger.info({
      promptLength: request.prompt.length,
      promptWordCount: request.prompt.split(/\s+/).length,
      fullPrompt: request.prompt,
      hasReferences,
      referenceCount: request.referenceImages?.length || 0,
      referenceInstructions: request.referenceImages?.map((ref, i) => ({
        index: i,
        instructionText: ref.instructionText || null,
        characterName: ref.characterName || null,
      })),
      hasSystemInstruction: !!request.systemInstruction,
      systemInstructionLength: request.systemInstruction?.length || 0,
      size,
      mainlineModel: this.mainlineModel,
      quality: this.quality,
    }, 'Generating image with OpenAI - Full Request Details');

    try {
      // Build content parts: interleaved text/image pairs + main prompt
      const contentParts: ResponseInputContent[] = [];

      // Add reference images with interleaved instruction text
      if (hasReferences) {
        logger.info({
          count: request.referenceImages!.length,
          references: request.referenceImages!.map(ref => ({
            hasUrl: !!ref.url,
            hasBase64: !!ref.base64Data,
            characterName: ref.characterName,
            hasInstructionText: !!ref.instructionText,
            mimeType: ref.mimeType,
            base64Length: ref.base64Data?.length || 0,
          })),
        }, 'Adding reference images to OpenAI request (interleaved mode)');

        for (const refImage of request.referenceImages!) {
          let imageBase64: string;
          let mimeType: string;

          if (refImage.base64Data) {
            imageBase64 = refImage.base64Data;
            mimeType = refImage.mimeType || 'image/png';
          } else if (refImage.url) {
            const imageBuffer = await this.downloadImage(refImage.url);
            imageBase64 = imageBuffer.toString('base64');
            mimeType = 'image/jpeg';
          } else {
            throw new Error('Reference image must have either url or base64Data');
          }

          // Interleave: instruction text before its image
          if (refImage.instructionText) {
            contentParts.push({ type: 'input_text', text: refImage.instructionText });
          }

          contentParts.push({
            type: 'input_image',
            detail: 'auto',
            image_url: `data:${mimeType};base64,${imageBase64}`,
          });
        }
      }

      // Add main scene prompt last
      contentParts.push({ type: 'input_text', text: request.prompt });

      logger.info({
        partsCount: contentParts.length,
        partsStructure: contentParts.map((p, idx) => {
          if (p.type === 'input_image') {
            return { index: idx, type: 'image', urlLength: p.image_url?.length ?? 0 };
          }
          if (p.type === 'input_text') {
            return {
              index: idx,
              type: 'text',
              textLength: p.text.length,
              textPreview: p.text.substring(0, 100),
            };
          }
          return { index: idx, type: p.type };
        }),
        size,
        quality: this.quality,
        mainlineModel: this.mainlineModel,
      }, 'Calling OpenAI Responses API with full request details');

      // Build image_generation tool config
      const imageGenTool: Tool.ImageGeneration = {
        type: 'image_generation',
        quality: this.quality,
        size,
        output_format: 'jpeg',
        ...(hasReferences && { input_fidelity: 'high' as const }),
      };

      const response = await this.client.responses.create({
        model: this.mainlineModel,
        ...(request.systemInstruction ? { instructions: request.systemInstruction } : {}),
        input: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
        tools: [imageGenTool],
      });

      // Extract image from response output
      const imageOutput = response.output.find(
        (o): o is ResponseOutputItem.ImageGenerationCall => o.type === 'image_generation_call'
      );

      if (!imageOutput || !imageOutput.result) {
        logger.error({
          outputTypes: response.output.map(o => o.type),
          outputCount: response.output.length,
          promptLength: request.prompt.length,
          hasReferences,
        }, 'No image_generation_call in OpenAI response');

        throw new Error('No image generated - no image_generation_call in response');
      }

      // Decode base64 image data
      const imageData = Buffer.from(imageOutput.result, 'base64');
      const dimensions = this.getDimensionsFromSize(size);

      logger.info({
        imageSize: imageData.length,
        mimeType: 'image/jpeg',
        width: dimensions.width,
        height: dimensions.height,
      }, 'OpenAI image generated successfully');

      // Report usage for cost tracking (OpenAI GPT image flat rate)
      request.onUsage?.({
        provider: 'openai',
        operation: request.operation || 'image_generate',
        model: 'openai-gpt-image',
        inputUnits: 1,
      });

      return {
        imageData,
        mimeType: 'image/jpeg',
        width: dimensions.width,
        height: dimensions.height,
        format: 'jpeg',
      };
    } catch (error: any) {
      // Handle rate limiting with specific message
      if (error?.status === 429) {
        logger.warn({
          error: error.message,
          retryAfter: error.headers?.['retry-after'],
        }, 'OpenAI rate limit hit');
        throw new Error(`OpenAI rate limit exceeded. ${error.message}`);
      }

      logger.error({ error }, 'Failed to generate image with OpenAI');
      throw new Error(`OpenAI image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Map our aspect ratio strings to OpenAI size strings
   */
  private mapAspectRatio(aspectRatio?: string): '1024x1024' | '1024x1536' | '1536x1024' | 'auto' {
    const sizeMap: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
      '1:1': '1024x1024',
      '16:9': '1536x1024',
      '9:16': '1024x1536',
      '4:3': '1536x1024',
      '3:4': '1024x1536',
    };

    return sizeMap[aspectRatio || '16:9'] || '1536x1024';
  }

  /**
   * Get pixel dimensions from OpenAI size string
   */
  private getDimensionsFromSize(size: string): { width: number; height: number } {
    const dimensionsMap: Record<string, { width: number; height: number }> = {
      '1024x1024': { width: 1024, height: 1024 },
      '1536x1024': { width: 1536, height: 1024 },
      '1024x1536': { width: 1024, height: 1536 },
    };

    return dimensionsMap[size] || { width: 1536, height: 1024 };
  }

  /**
   * Download image from URL and return as buffer
   */
  private async downloadImage(url: string): Promise<Buffer> {
    try {
      logger.debug({ url }, 'Downloading reference image for OpenAI');

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
