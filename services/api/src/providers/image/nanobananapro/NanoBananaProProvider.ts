/**
 * Nano Banana Pro Provider - Gemini Image Generation Implementation
 * Implements IImageProvider using @google/genai SDK
 * 
 * Model: gemini-3.1-flash-image (Nano Banana 2)
 * Supports:
 * - Cartoon/illustration styles (better than Imagen 3 for non-photorealistic)
 * - AI-generated images as references (for character consistency)
 * - Reference limits depend on model (e.g. Gemini 3.1 Flash Image: up to ~4 character + ~10 object refs)
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
    this.model = modelOverride || config.nanoBanana?.model || 'gemini-3.1-flash-image';
    
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
    const refList = request.referenceImages || [];
    const characterRefCount = refList.filter((r) => r.referenceKind === 'character').length;
    const objectRefCount = refList.filter((r) => r.referenceKind === 'object').length;
    const unlabeledRefCount = refList.length - characterRefCount - objectRefCount;

    logger.info({ 
      promptLength: request.prompt.length,
      promptWordCount: request.prompt.split(/\s+/).length,
      fullPrompt: request.prompt,
      hasReferences: !!request.referenceImages,
      referenceCount: request.referenceImages?.length || 0,
      referenceKindCharacterCount: characterRefCount,
      referenceKindObjectCount: objectRefCount,
      referenceKindUnlabeledCount: unlabeledRefCount,
      referenceInstructions: request.referenceImages?.map((ref, i) => ({
        index: i,
        instructionText: ref.instructionText || null,
        characterName: ref.characterName || null,
        referenceKind: ref.referenceKind ?? null,
      })),
      hasSystemInstruction: !!request.systemInstruction,
      systemInstructionLength: request.systemInstruction?.length || 0,
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
      hasPreviousInteractionId: !!request.previousInteractionId,
      previousInteractionId: request.previousInteractionId ?? null,
    }, 'Editing image with Nano Banana Pro - Image Edit Request');

    try {
      // Build content parts: reference images first, then original image, then edit instructions
      const parts: any[] = await this.buildReferenceParts(request.referenceImages);

      const originalImageInstruction = request.operation === 'graphic_novel_page_edit'
        ? 'PAGE TEMPLATE TO FILL: this image is a color-coded layout template with fixed slot frames and gutters. Treat it as the exact page geometry to preserve and fill with final art.'
        : 'FAILED SCENE ILLUSTRATION TO REPAIR: use this image for composition, pose intent, background, lighting, and art style continuity only. ' +
          'Do not use it as the source of truth for any character face, hairstyle, body identity, or outfit detail that the edit instructions identify as wrong.';

      parts.push({ text: originalImageInstruction });

      // Add the original generated image that needs editing.
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
        previousInteractionId: request.previousInteractionId,
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
    previousInteractionId?: string;
    onUsage?: (u: UsageMetadata) => void;
    operation?: string;
  }): Promise<GeneratedImage> {
    const {
      parts,
      aspectRatio,
      systemInstruction,
      personGeneration,
      promptLength,
      referenceCount,
      operationType,
      previousInteractionId,
      onUsage,
      operation: op,
    } = params;

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
      hasPreviousInteractionId: !!previousInteractionId,
      previousInteractionId: previousInteractionId ?? null,
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

    try {
      return await this.callGeminiInteractionsImageAPI({
        parts,
        aspectRatio,
        systemInstruction,
        promptLength,
        referenceCount,
        operationType,
        previousInteractionId,
        onUsage,
        operation: op,
      });
    } catch (interactionError) {
      logger.warn({
        err: interactionError instanceof Error
          ? { message: interactionError.message, name: interactionError.name, stack: interactionError.stack }
          : String(interactionError),
        model: this.model,
        operationType,
        hasPreviousInteractionId: !!previousInteractionId,
        previousInteractionId: previousInteractionId ?? null,
      }, 'Gemini Interactions image call failed — falling back to generateContent');
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
          `2) Too many or incompatible reference images (current: ${referenceCount}; for gemini-3.1-flash-image use separate character vs object caps — see IMAGE_MAX_CHARACTER_REFERENCE_IMAGES / IMAGE_MAX_OBJECT_REFERENCE_IMAGES), ` +
          `3) Unsupported content in prompt. ` +
          `Try simplifying the prompt or reducing object references (environment / outfit plates) first.`
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
      const imageTokens = this.getOutputImageTokens();
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
   * Gemini Interactions API is the only Gemini path that supports
   * previous_interaction_id. We still send the full reference pack on every turn;
   * the previous id adds provider-side continuity for image repair.
   */
  private async callGeminiInteractionsImageAPI(params: {
    parts: any[];
    aspectRatio?: string;
    systemInstruction?: string;
    promptLength: number;
    referenceCount: number;
    operationType: 'generate' | 'edit';
    previousInteractionId?: string;
    onUsage?: (u: UsageMetadata) => void;
    operation?: string;
  }): Promise<GeneratedImage> {
    const {
      parts,
      aspectRatio,
      systemInstruction,
      promptLength,
      referenceCount,
      operationType,
      previousInteractionId,
      onUsage,
      operation: op,
    } = params;

    const interactionInput = this.convertPartsToInteractionInput(parts);
    const responseFormat: Record<string, unknown> = {
      type: 'image',
      mime_type: 'image/jpeg',
      ...(aspectRatio && { aspect_ratio: aspectRatio }),
      image_size: config.nanoBanana?.imageSize || '1K',
    };

    const interaction = await (this.client as unknown as {
      interactions: {
        create: (params: Record<string, unknown>) => Promise<Record<string, any>>;
      };
    }).interactions.create({
      model: this.model,
      input: interactionInput,
      stream: false,
      store: true,
      response_format: responseFormat,
      ...(systemInstruction && { system_instruction: systemInstruction }),
      ...(previousInteractionId && { previous_interaction_id: previousInteractionId }),
    });

    logger.info({
      interactionId: interaction.id,
      previousInteractionId: previousInteractionId ?? null,
      status: interaction.status,
      model: interaction.model ?? this.model,
      outputCount: Array.isArray(interaction.outputs) ? interaction.outputs.length : 0,
      usage: interaction.usage ?? null,
      operationType,
    }, `Received response from Gemini Interactions API (${operationType})`);

    if (interaction.status && interaction.status !== 'completed') {
      throw new Error(`Gemini Interactions image ${operationType} did not complete. Status: ${interaction.status}`);
    }

    const outputParts = [
      ...this.flattenInteractionOutputs(interaction.output_image ?? interaction.outputImage),
      ...this.flattenInteractionOutputs(interaction.outputs),
      ...this.flattenInteractionSteps(interaction.steps),
    ];
    const textOutputs = outputParts.filter((part) => this.getInteractionText(part));
    if (textOutputs.length > 0) {
      const modelText = textOutputs.map((part) => this.getInteractionText(part)).filter(Boolean).join('\n');
      logger.info({
        textPartsCount: textOutputs.length,
        modelText: modelText.substring(0, 500),
        fullLength: modelText.length,
        operationType,
      }, `Interactions model returned text alongside ${operationType === 'edit' ? 'edited' : 'generated'} image`);
    }

    const imageOutput = outputParts.find((part) => this.getInteractionImageData(part) || this.getInteractionImageUri(part));
    if (!imageOutput) {
      logger.error({
        interactionId: interaction.id,
        status: interaction.status,
        outputCount: outputParts.length,
        outputTypes: outputParts.map((part) => part?.type ?? Object.keys(part ?? {})),
        promptLength,
        referenceCount,
        operationType,
      }, 'No image data in Gemini Interactions output');
      throw new Error('No image data in Gemini Interactions output');
    }

    const imageDataBase64 = this.getInteractionImageData(imageOutput);
    const imageUri = this.getInteractionImageUri(imageOutput);
    const imageData = imageDataBase64
      ? Buffer.from(imageDataBase64, 'base64')
      : await this.downloadImage(imageUri!);

    const dimensions = this.calculateDimensions(aspectRatio);
    const mimeType = this.getInteractionImageMimeType(imageOutput) || 'image/png';
    const format = this.getFormatFromMimeType(mimeType);

    logger.info({
      interactionId: interaction.id,
      previousInteractionId: previousInteractionId ?? null,
      imageSize: imageData.length,
      mimeType,
      width: dimensions.width,
      height: dimensions.height,
      operationType,
    }, `Image ${operationType === 'edit' ? 'edited' : 'generated'} successfully via Interactions`);

    const usage = interaction.usage as {
      total_input_tokens?: number;
      total_output_tokens?: number;
      total_tokens?: number;
      total_thought_tokens?: number;
    } | undefined;
    if (onUsage && usage) {
      onUsage({
        provider: 'gemini',
        operation: op ?? (operationType === 'edit' ? 'image_edit' : 'image_generate'),
        model: this.model,
        inputUnits: usage.total_input_tokens ?? 0,
        thoughtTokens: usage.total_thought_tokens ?? 0,
        imageTokens: this.getOutputImageTokens(),
      });
    }

    return {
      imageData,
      mimeType,
      width: dimensions.width,
      height: dimensions.height,
      format,
      providerInteractionId: typeof interaction.id === 'string' ? interaction.id : undefined,
    };
  }

  private convertPartsToInteractionInput(parts: any[]): any[] {
    return parts.map((part, index) => {
      if (part?.text) {
        return { type: 'text', text: part.text };
      }
      if (part?.inlineData) {
        return {
          type: 'image',
          data: part.inlineData.data,
          mime_type: part.inlineData.mimeType || 'image/png',
        };
      }
      if (part?.fileData) {
        return {
          type: 'image',
          uri: part.fileData.fileUri,
          mime_type: part.fileData.mimeType || 'image/png',
        };
      }
      throw new Error(`Unsupported Gemini part for Interactions input at index ${index}`);
    });
  }

  private flattenInteractionOutputs(outputs: unknown): any[] {
    if (outputs && !Array.isArray(outputs)) {
      return this.flattenInteractionOutputs([outputs]);
    }

    if (!Array.isArray(outputs)) {
      return [];
    }

    return outputs.flatMap((output: any) => {
      if (Array.isArray(output?.parts)) {
        return output.parts;
      }
      return [output];
    });
  }

  private flattenInteractionSteps(steps: unknown): any[] {
    if (!Array.isArray(steps)) {
      return [];
    }

    return steps.flatMap((step: any) => [
      ...this.flattenInteractionOutputs(step?.content),
      ...this.flattenInteractionOutputs(step?.summary),
      ...this.flattenInteractionOutputs(step?.output),
    ]);
  }

  private getInteractionText(output: any): string | undefined {
    if (!output || typeof output !== 'object') {
      return undefined;
    }
    return typeof output.text === 'string' ? output.text : undefined;
  }

  private getInteractionImageData(output: any): string | undefined {
    if (!output || typeof output !== 'object') {
      return undefined;
    }
    if (typeof output.data === 'string') return output.data;
    if (typeof output.inlineData?.data === 'string') return output.inlineData.data;
    if (typeof output.inline_data?.data === 'string') return output.inline_data.data;
    return undefined;
  }

  private getInteractionImageUri(output: any): string | undefined {
    if (!output || typeof output !== 'object') {
      return undefined;
    }
    if (typeof output.uri === 'string') return output.uri;
    if (typeof output.fileData?.fileUri === 'string') return output.fileData.fileUri;
    if (typeof output.file_data?.file_uri === 'string') return output.file_data.file_uri;
    return undefined;
  }

  private getInteractionImageMimeType(output: any): string | undefined {
    if (!output || typeof output !== 'object') {
      return undefined;
    }
    return output.mime_type
      || output.mimeType
      || output.inlineData?.mimeType
      || output.inline_data?.mime_type;
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

  private getOutputImageTokens(): number {
    if (this.model.includes('gemini-2.5-flash-image')) {
      return 1290;
    }

    const imageSize = (config.nanoBanana?.imageSize || '1K').toUpperCase();
    if (this.model.includes('gemini-3.1-flash-image')) {
      if (imageSize === '0.5K' || imageSize === '512' || imageSize === '512PX') return 747;
      if (imageSize === '2K') return 1680;
      if (imageSize === '4K') return 2520;
      return 1120;
    }

    if (this.model.includes('gemini-3-pro-image')) {
      if (imageSize === '4K') return 2000;
      return 1120;
    }

    return 1120;
  }
  
  /**
   * Check if the current model supports the personGeneration config parameter.
   * Some models reject it before the request is sent through the Gemini API.
   */
  private supportsPersonGeneration(): boolean {
    const unsupportedModels = [
      'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-image',
      'gemini-3.0-flash-image-preview',
      'gemini-3-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-3-pro-image',
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
