/**
 * Nano Banana Pro Provider - Gemini Image Generation Implementation
 * Implements IImageProvider using @google/genai SDK
 * 
 * Model: gemini-2.5-flash-image (also known as "Nano Banana")
 * Supports:
 * - Cartoon/illustration styles (better than Imagen 3 for non-photorealistic)
 * - AI-generated images as references (for character consistency)
 * - Up to 14 reference images in one request
 * - Aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
 */

import { GoogleGenAI, Modality } from '@google/genai';
import type { IImageProvider, GenerateImageRequest, EditImageRequest, GeneratedImage, ReferenceImage } from '../../base/IImageProvider';
import type { UsageMetadata } from '../../base/UsageMetadata';
import type { IFileManager } from '../../base/IFileManager';
import { GeminiFileManager } from './GeminiFileManager';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

export class NanoBananaProProvider implements IImageProvider {
  private client: GoogleGenAI;
  private model: string;
  private fileManager: GeminiFileManager | null = null;
  
  constructor(apiKey?: string, modelOverride?: string) {
    const key = apiKey || config.google.apiKey;
    
    if (!key) {
      throw new Error('Google API Key is required for Nano Banana Pro. Set GOOGLE_API_KEY env var.');
    }
    
    this.client = new GoogleGenAI({ apiKey: key });
    this.model = modelOverride || config.nanoBanana?.model || 'gemini-2.5-flash-image';
    
    logger.info({ 
      model: this.model 
    }, 'Nano Banana Pro Provider initialized');
  }

  /**
   * Get the file manager for uploading reference files to Google Files API.
   * Lazy-initialized on first call.
   */
  getFileManager(): IFileManager | null {
    if (!this.fileManager) {
      this.fileManager = new GeminiFileManager(this.client);
    }
    return this.fileManager;
  }
  
  /**
   * Generate image using Gemini Image model (Nano Banana)
   */
  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    // Log full prompt and all text parts for debugging
    logger.info({ 
      promptLength: request.prompt.length,
      promptWordCount: request.prompt.split(/\s+/).length,
      fullPrompt: request.prompt,
      hasReferences: !!request.referenceImages,
      referenceCount: request.referenceImages?.length || 0,
      referenceInstructions: request.referenceImages?.map((ref, i) => ({
        index: i,
        instructionText: ref.instructionText || null,
        characterName: ref.characterName || null,
      })),
      aspectRatio: request.aspectRatio,
      model: this.model,
    }, 'Generating image with Nano Banana Pro - Full Request Details');
    
    try {
      // Build content parts: reference images first, then main prompt
      const parts: any[] = await this.buildReferenceParts(request.referenceImages);
      parts.push({ text: request.prompt });
      
      return await this.callGeminiImageAPI({
        parts,
        aspectRatio: request.aspectRatio,
        systemInstruction: request.systemInstruction,
        personGeneration: request.personGeneration,
        promptLength: request.prompt.length,
        referenceCount: request.referenceImages?.length || 0,
        operationType: 'generate',
        onUsage: request.onUsage,
        operation: request.operation ?? 'image_generate',
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate image with Nano Banana Pro');
      throw new Error(`Nano Banana Pro generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Edit an existing image to fix specific issues while preserving correct elements.
   * Sends the original image + edit instructions + reference images to Gemini.
   */
  async editImage(request: EditImageRequest): Promise<GeneratedImage> {
    logger.info({
      editInstructionsLength: request.editInstructions.length,
      editInstructionsPreview: request.editInstructions.substring(0, 300),
      originalMimeType: request.originalMimeType,
      originalImageSize: request.originalImage.length,
      hasReferences: !!request.referenceImages,
      referenceCount: request.referenceImages?.length || 0,
      aspectRatio: request.aspectRatio,
      model: this.model,
    }, 'Editing image with Nano Banana Pro - Image Edit Request');

    try {
      // Build content parts: reference images first, then original image, then edit instructions
      const parts: any[] = await this.buildReferenceParts(request.referenceImages);

      // Add the original generated image that needs editing
      parts.push({
        inlineData: {
          mimeType: request.originalMimeType,
          data: request.originalImage.toString('base64'),
        },
      });

      // Add edit instructions last
      parts.push({ text: request.editInstructions });

      return await this.callGeminiImageAPI({
        parts,
        aspectRatio: request.aspectRatio,
        systemInstruction: request.systemInstruction,
        personGeneration: request.personGeneration,
        promptLength: request.editInstructions.length,
        referenceCount: request.referenceImages?.length || 0,
        operationType: 'edit',
        onUsage: request.onUsage,
        operation: request.operation ?? 'image_edit',
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to edit image with Nano Banana Pro');
      throw new Error(`Nano Banana Pro image edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build interleaved reference image parts for the content array.
   * Each reference image is preceded by its instructionText so the model
   * unambiguously knows which description matches which image.
   */
  private async buildReferenceParts(referenceImages?: ReferenceImage[]): Promise<any[]> {
    const parts: any[] = [];

    if (!referenceImages || referenceImages.length === 0) {
      return parts;
    }

    logger.info({
      count: referenceImages.length,
      references: referenceImages.map(ref => ({
        hasUrl: !!ref.url,
        hasBase64: !!ref.base64Data,
        hasFileUri: !!ref.fileUri,
        characterName: ref.characterName,
        hasInstructionText: !!ref.instructionText,
        mimeType: ref.mimeType,
        urlPreview: ref.url ? ref.url.substring(0, 100) : undefined,
        base64Length: ref.base64Data?.length || 0,
      }))
    }, 'Adding reference images to request (interleaved mode)');

    for (const refImage of referenceImages) {
      // Interleave: place instruction text immediately before its image
      if (refImage.instructionText) {
        parts.push({ text: refImage.instructionText });
      }

      // Prefer fileUri (Files API) over inline base64 to reduce payload
      if (refImage.fileUri) {
        const mimeType = refImage.mimeType || 'image/png';
        parts.push({
          fileData: {
            fileUri: refImage.fileUri,
            mimeType,
          },
        });
        logger.debug({ fileUri: refImage.fileUri }, 'Using file URI for reference (Files API)');
      } else if (refImage.base64Data) {
        const mimeType = refImage.mimeType || 'image/png';
        parts.push({
          inlineData: {
            mimeType,
            data: refImage.base64Data,
          },
        });
        logger.debug('Using provided base64 data for reference');
      } else if (refImage.url) {
        const imageBuffer = await this.downloadImage(refImage.url);
        const imageBase64 = imageBuffer.toString('base64');
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        });
        logger.debug({ url: refImage.url }, 'Downloaded and converted reference image');
      } else {
        throw new Error('Reference image must have fileUri, base64Data, or url');
      }
    }

    return parts;
  }

  /**
   * Shared Gemini API call + response parsing for both generate and edit operations.
   * Handles token counting, API call, response validation, and image extraction.
   */
  private async callGeminiImageAPI(params: {
    parts: any[];
    aspectRatio?: string;
    systemInstruction?: string;
    personGeneration?: string;
    promptLength: number;
    referenceCount: number;
    operationType: 'generate' | 'edit';
    onUsage?: (u: UsageMetadata) => void;
    operation?: string;
  }): Promise<GeneratedImage> {
    const { parts, aspectRatio, systemInstruction, personGeneration, promptLength, referenceCount, operationType, onUsage, operation: op } = params;

    // Log full request structure (untruncated for debugging)
    logger.info({
      partsCount: parts.length,
      hasSystemInstruction: !!systemInstruction,
      systemInstructionLength: systemInstruction?.length || 0,
      systemInstruction: systemInstruction || null,
      partsStructure: parts.map((p, idx) => {
        if (p.inlineData) {
          return {
            index: idx,
            type: 'inlineImage',
            mimeType: p.inlineData.mimeType,
            dataLength: p.inlineData.data.length,
          };
        }
        if (p.fileData) {
          return {
            index: idx,
            type: 'fileUri',
            mimeType: p.fileData.mimeType,
            fileUri: p.fileData.fileUri,
          };
        }
        return {
          index: idx,
          type: 'text',
          textLength: p.text?.length || 0,
          text: p.text,
        };
      }),
      aspectRatio,
      model: this.model,
      operationType,
    }, `Calling Gemini API for image ${operationType}`);

    // Count tokens before generation (optional but helpful for diagnostics)
    try {
      const tokenCountResult = await this.client.models.countTokens({
        model: this.model,
        contents: [{ role: 'user', parts }],
      });

      logger.info({
        promptLength,
        totalTokens: tokenCountResult.totalTokens,
        maxInputTokens: 32768,
        tokenUtilization: `${(((tokenCountResult.totalTokens || 0) / 32768) * 100).toFixed(1)}%`,
        operationType,
      }, `Token count for image ${operationType}`);

      if ((tokenCountResult.totalTokens || 0) > 30000) {
        logger.warn({
          totalTokens: tokenCountResult.totalTokens,
          limit: 32768,
          excess: (tokenCountResult.totalTokens || 0) - 30000,
        }, 'Prompt approaching token limit (>90%)');
      }
    } catch (tokenError) {
      logger.debug({ error: tokenError }, 'Could not count tokens (non-critical)');
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts }],
      config: {
        ...(systemInstruction && { systemInstruction }),
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: {
          ...(aspectRatio && { aspectRatio }),
          imageSize: config.nanoBanana?.imageSize || '1K',
          ...(personGeneration && this.supportsPersonGeneration() && {
            personGeneration: this.mapPersonGeneration(personGeneration),
          }),
        },
      },
    });

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
      operationType,
    }, `Received response from Gemini API (${operationType})`);

    // Check if prompt was blocked
    if (response.promptFeedback?.blockReason) {
      const blockReason = response.promptFeedback.blockReason;
      const safetyRatings = response.promptFeedback?.safetyRatings || [];

      logger.error({
        blockReason,
        safetyRatings: safetyRatings.map(r => ({
          category: r.category,
          probability: r.probability,
        })),
        promptLength,
        referenceCount,
        operationType,
      }, `Gemini blocked image ${operationType} prompt`);

      const safetyDetails = safetyRatings
        .filter(r => r.probability !== 'NEGLIGIBLE')
        .map(r => `${r.category}: ${r.probability}`)
        .join(', ');

      throw new Error(`Image ${operationType} blocked by Gemini: ${blockReason}. Details: ${safetyDetails || 'none'}`);
    }

    // Check for candidates
    if (!response.candidates || response.candidates.length === 0) {
      logger.error({ promptLength, referenceCount, operationType }, 'No candidates in Gemini response');
      throw new Error(`No image ${operationType === 'edit' ? 'edited' : 'generated'} - no candidates in response`);
    }

    // Find image part in response
    const candidate = response.candidates[0];

    // Validate candidate structure
    if (!candidate.content) {
      // Log full raw response for debugging (Google returns minimal info for IMAGE_OTHER)
      logger.error({
        candidate: JSON.parse(JSON.stringify(candidate)),
        finishReason: candidate.finishReason,
        finishMessage: candidate.finishMessage,
        safetyRatings: candidate.safetyRatings,
        promptFeedback: response.promptFeedback,
        modelVersion: (response as unknown as Record<string, unknown>).modelVersion,
        responseId: (response as unknown as Record<string, unknown>).responseId,
        rawResponseKeys: Object.keys(response),
        rawCandidateKeys: Object.keys(candidate),
        promptLength,
        referenceCount,
        operationType,
      }, 'Candidate has no content - likely blocked or filtered');

      // Log any reasoning/explanation from model (may help diagnose IMAGE_OTHER)
      if (candidate.finishMessage || response.promptFeedback) {
        logger.warn({
          finishMessage: candidate.finishMessage,
          promptFeedbackFull: response.promptFeedback
            ? JSON.stringify(response.promptFeedback)
            : null,
          finishReason: candidate.finishReason,
          operationType,
        }, 'IMAGE_OTHER — model reasoning/explanation (if any)');
      }

      if (candidate.finishReason === 'NO_IMAGE') {
        throw new Error(
          `Gemini could not ${operationType === 'edit' ? 'edit' : 'generate'} an image. ` +
          `This may occur due to: ` +
          `1) Prompt too long (current: ${promptLength} chars), ` +
          `2) Too many reference images (current: ${referenceCount}, max: 3), ` +
          `3) Unsupported content in prompt. ` +
          `Try simplifying the prompt or reducing reference images.`
        );
      }

      const reason = candidate.finishReason || 'unknown';
      throw new Error(
        `No image content in candidate. Finish reason: ${reason}. ` +
        `Candidate keys: [${Object.keys(candidate).join(', ')}]. ` +
        `Response keys: [${Object.keys(response).join(', ')}]`,
      );
    }

    if (!candidate.content.parts || !Array.isArray(candidate.content.parts)) {
      logger.error({
        candidate,
        contentType: typeof candidate.content,
      }, 'Candidate content has no parts array');
      throw new Error('Invalid candidate structure - no parts array in content');
    }

    // Log any text parts from the model (reasoning/thinking)
    const textParts = candidate.content.parts.filter(p => p.text);
    if (textParts.length > 0) {
      const modelText = textParts.map(p => p.text).join('\n');
      logger.info({
        textPartsCount: textParts.length,
        modelText: modelText.substring(0, 500),
        fullLength: modelText.length,
        operationType,
      }, `Model returned text reasoning alongside ${operationType === 'edit' ? 'edited' : 'generated'} image`);
    }

    const imagePart = candidate.content.parts.find(p => p.inlineData);

    if (!imagePart?.inlineData) {
      // Log any text/reasoning from parts — model may have returned text instead of image
      const textPartsNoImage = candidate.content.parts.filter(p => p.text);
      if (textPartsNoImage.length > 0) {
        const modelReasoning = textPartsNoImage.map(p => p.text).join('\n');
        logger.warn({
          textPartsCount: textPartsNoImage.length,
          modelReasoning: modelReasoning.substring(0, 1000),
          fullLength: modelReasoning.length,
          operationType,
        }, 'Model returned reasoning instead of image — may explain refusal');
      }

      logger.error({
        candidate,
        partsCount: candidate.content.parts.length,
        partTypes: candidate.content.parts.map(p => Object.keys(p)),
        operationType,
      }, 'No image data in response parts');
      throw new Error('No image data in response - parts array contains no inlineData');
    }

    // Decode base64 image
    const imageData = Buffer.from(imagePart.inlineData.data!, 'base64');

    // Calculate dimensions from aspect ratio
    const dimensions = this.calculateDimensions(aspectRatio);

    // Determine format from mime type
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const format = this.getFormatFromMimeType(mimeType);

    logger.info({
      imageSize: imageData.length,
      mimeType,
      width: dimensions.width,
      height: dimensions.height,
      operationType,
    }, `Image ${operationType === 'edit' ? 'edited' : 'generated'} successfully`);

    // Report usage for cost tracking
    const usageMeta = response.usageMetadata as {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      thoughtsTokenCount?: number;
      candidatesTokenCountDetails?: { thoughtTokenCount?: number };
    } | undefined;
    if (onUsage && usageMeta) {
      const inputUnits = usageMeta.promptTokenCount ?? 0;
      const thoughtTokens = usageMeta.thoughtsTokenCount ?? usageMeta.candidatesTokenCountDetails?.thoughtTokenCount ?? 0;
      const imageTokens = 1120; // Gemini 3.1 Flash Image 1K output per Vertex AI pricing
      onUsage({
        provider: 'gemini',
        operation: op ?? (operationType === 'edit' ? 'image_edit' : 'image_generate'),
        model: this.model,
        inputUnits,
        thoughtTokens,
        imageTokens,
      });
    }

    return {
      imageData,
      mimeType,
      width: dimensions.width,
      height: dimensions.height,
      format,
    };
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
   * Check if the current model supports the personGeneration config parameter.
   * Some models (e.g. gemini-3-pro-image-preview) reject it with a 400 error.
   */
  private supportsPersonGeneration(): boolean {
    const unsupportedModels = [
      'gemini-3-pro-image-preview',
      'gemini-3.0-pro-image-preview',
    ];
    return !unsupportedModels.some(m => this.model.includes(m));
  }

  /**
   * Map provider-agnostic personGeneration values to Gemini SDK format
   */
  private mapPersonGeneration(value: string): string {
    const mapping: Record<string, string> = {
      'allow_all': 'ALLOW_ALL',
      'allow_adult': 'ALLOW_ADULT',
      'dont_allow': 'ALLOW_NONE',
    };
    return mapping[value] || 'ALLOW_ALL';
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
