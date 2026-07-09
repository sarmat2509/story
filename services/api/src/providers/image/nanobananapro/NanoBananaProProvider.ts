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
import {
  inferImageMimeTypeFromPath,
  normalizeImageMimeType,
  resolveImageMimeType,
} from '../../../utils/imageMimeType';

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
    this.model = modelOverride || config.image?.simpleModel || 'gemini-3.1-flash-lite-image';
    
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
      imageSize: request.imageSize,
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
        imageSize: request.imageSize,
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
      imageSize: request.imageSize,
    }, 'Editing image with Nano Banana Pro - Image Edit Request');

    try {
      const referenceParts = await this.buildReferenceParts(request.referenceImages);

      const isGraphicNovelPageEdit = request.operation?.startsWith('graphic_novel_page') === true;
      const originalImageInstruction = isGraphicNovelPageEdit
        ? 'The next image is SOURCE_IMAGE: the comic page to edit. Preserve the existing page aspect, visible panel count, panel borders, gutters, and composition while applying the requested corrections.'
        : 'The next image is SOURCE_IMAGE: the failed scene illustration to repair. Use this image for composition, pose intent, background, lighting, and art style continuity. ' +
          'Use the attached character references as the source of truth for any character face, hairstyle, body identity, or appearance detail that the edit instructions identify as wrong.';

      const parts: any[] = [];
      parts.push({ text: originalImageInstruction });
      parts.push({
        inlineData: {
          mimeType: request.originalMimeType,
          data: request.originalImage.toString('base64'),
        },
      });
      parts.push(...referenceParts);
      parts.push({ text: request.editInstructions });

      return await this.callGeminiImageAPI({
        parts,
        aspectRatio: request.aspectRatio,
        systemInstruction: request.systemInstruction,
        personGeneration: request.personGeneration,
        imageSize: request.imageSize,
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
        referenceBindingId: ref.referenceBindingId,
        imageIndex: ref.imageIndex,
        hasInstructionText: !!ref.instructionText,
        mimeType: ref.mimeType,
        storagePath: ref.storagePath,
        resolvedMimeType: this.resolveReferenceMimeType(ref),
        urlPreview: ref.url ? ref.url.substring(0, 100) : undefined,
        base64Length: ref.base64Data?.length || 0,
      }))
    }, 'Adding reference images to request (interleaved mode)');

    for (const [index, refImage] of referenceImages.entries()) {
      parts.push({ text: this.buildReferenceLabel(refImage, index) });

      // Prefer fileUri (Files API) over inline base64 to reduce payload
      if (refImage.fileUri) {
        const mimeType = this.resolveReferenceMimeType(refImage);
        parts.push({
          fileData: {
            fileUri: refImage.fileUri,
            mimeType,
          },
        });
        logger.debug({ fileUri: refImage.fileUri, mimeType }, 'Using file URI for reference (Files API)');
      } else if (refImage.base64Data) {
        const mimeType = this.resolveReferenceMimeType(refImage);
        parts.push({
          inlineData: {
            mimeType,
            data: refImage.base64Data,
          },
        });
        logger.debug({ mimeType }, 'Using provided base64 data for reference');
      } else if (refImage.url) {
        const imageBuffer = await this.downloadImage(refImage.url);
        const imageBase64 = imageBuffer.toString('base64');
        const mimeType = this.resolveReferenceMimeType(refImage, 'image/jpeg');
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
        logger.debug({ url: refImage.url, mimeType }, 'Downloaded and converted reference image');
      } else {
        throw new Error('Reference image must have fileUri, base64Data, or url');
      }
    }

    return parts;
  }

  private buildReferenceLabel(refImage: ReferenceImage, index: number): string {
    const instructionText = refImage.instructionText?.trim();
    if (instructionText) {
      return this.normalizeReferenceInstructionText(instructionText);
    }

    const label = refImage.referenceBindingId || `REFERENCE_IMAGE_${index + 1}`;
    const kind =
      refImage.referenceKind === 'object'
        ? 'an object or environment reference'
        : 'a character reference';
    const name = refImage.characterName ? ` for "${refImage.characterName}"` : '';
    return `The next image is ${label}: ${kind}${name}.`;
  }

  private normalizeReferenceInstructionText(instructionText: string): string {
    const text = instructionText.trim();
    if (/^the next image is\b/i.test(text)) {
      return text;
    }

    const match = text.match(/^([^:]+):\s*(.+)$/s);
    if (!match) {
      return `The next image is ${text.replace(/\.+$/, '')}.`;
    }

    const id = match[1].trim();
    const description = match[2].trim().replace(/\.+$/, '');
    const article = /^(?:a|an|the)\b/i.test(description)
      ? ''
      : /^[aeiou]/i.test(description)
        ? 'an '
        : 'a ';
    return `The next image is ${id}: ${article}${description}.`;
  }

  private resolveReferenceMimeType(refImage: ReferenceImage, fallback = 'image/png'): string {
    const resolved = resolveImageMimeType({
      mimeType: refImage.mimeType,
      storagePath: refImage.storagePath,
      url: refImage.url,
      fallback,
    });
    const inferred =
      inferImageMimeTypeFromPath(refImage.storagePath) || inferImageMimeTypeFromPath(refImage.url);
    const provided = normalizeImageMimeType(refImage.mimeType);

    if (provided && inferred && provided !== inferred) {
      logger.warn(
        {
          characterName: refImage.characterName,
          providedMimeType: provided,
          inferredMimeType: inferred,
          resolvedMimeType: resolved,
          storagePath: refImage.storagePath,
          urlPreview: refImage.url ? refImage.url.substring(0, 100) : undefined,
        },
        'Reference image MIME type differs from storage path; using inferred MIME type'
      );
    }

    return resolved;
  }

  /**
   * Shared Gemini API call + response parsing for both generate and edit operations.
   * Handles token counting, API call, response validation, and image extraction.
   */
  private async callGeminiImageAPI(params: {
    parts: any[];
    fallbackParts?: any[];
    aspectRatio?: string;
    systemInstruction?: string;
    personGeneration?: string;
    imageSize?: string;
    promptLength: number;
    referenceCount: number;
    operationType: 'generate' | 'edit';
    onUsage?: (u: UsageMetadata) => void;
    operation?: string;
  }): Promise<GeneratedImage> {
    const {
      parts,
      fallbackParts,
      aspectRatio,
      systemInstruction,
      personGeneration,
      imageSize,
      promptLength,
      referenceCount,
      operationType,
      onUsage,
      operation: op,
    } = params;
    const generateContentParts = fallbackParts ?? parts;

    const providerRequestId = `gemini-img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const requestDiagnostics = this.buildRequestDiagnostics({
      providerRequestId,
      parts,
      aspectRatio,
      systemInstruction,
      personGeneration,
      imageSize,
      promptLength,
      referenceCount,
      operationType,
      operation: op,
    });
    const generateContentRequestDiagnostics = fallbackParts
      ? this.buildRequestDiagnostics({
          providerRequestId,
          parts: fallbackParts,
          aspectRatio,
          systemInstruction,
          personGeneration,
          imageSize,
          promptLength,
          referenceCount,
          operationType,
          operation: op,
      })
      : requestDiagnostics;

    // Log full request structure (untruncated for debugging)
    logger.info({
      providerRequestId,
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
      diagnostics: requestDiagnostics,
      ...(fallbackParts && {
        fallbackPartsCount: fallbackParts.length,
        generateContentDiagnostics: generateContentRequestDiagnostics,
      }),
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
        providerRequestId,
      }, `Token count for image ${operationType}`);

      if ((tokenCountResult.totalTokens || 0) > 30000) {
        logger.warn({
          totalTokens: tokenCountResult.totalTokens,
          limit: 32768,
          excess: (tokenCountResult.totalTokens || 0) - 30000,
          providerRequestId,
        }, 'Prompt approaching token limit (>90%)');
      }
    } catch (tokenError) {
      logger.debug({
        providerRequestId,
        errorDiagnostics: this.extractApiErrorDiagnostics(tokenError),
      }, 'Could not count tokens (non-critical)');
    }

    const generateContentConfig = {
      ...(systemInstruction && { systemInstruction }),
      responseModalities: [Modality.IMAGE, Modality.TEXT],
      imageConfig: {
        ...(aspectRatio && { aspectRatio }),
        imageSize: imageSize || config.nanoBanana?.imageSize || '1K',
        ...(personGeneration && this.supportsPersonGeneration() && {
          personGeneration: this.mapPersonGeneration(personGeneration),
        }),
      },
    };

    const generateContentRequest = {
      model: this.model,
      contents: [{ role: 'user', parts: generateContentParts }],
      config: generateContentConfig,
    };

    let response: Awaited<ReturnType<typeof this.client.models.generateContent>>;
    try {
      response = await this.client.models.generateContent(generateContentRequest);
    } catch (generateContentError) {
      logger.error({
        providerRequestId,
        model: this.model,
        operationType,
        errorDiagnostics: this.extractApiErrorDiagnostics(generateContentError),
        requestDiagnostics: generateContentRequestDiagnostics,
        generateContentConfig: this.sanitizeForLog(generateContentConfig),
      }, 'Gemini generateContent image call failed');
      throw generateContentError;
    }

    // Log complete response structure
    logger.info({
      providerRequestId,
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
          `Try simplifying the prompt or reducing object references first.`
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
    const dimensions = this.calculateDimensions(aspectRatio, imageSize);

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
    if (onUsage) {
      const inputUnits = usageMeta?.promptTokenCount ?? 0;
      const thoughtTokens = usageMeta?.thoughtsTokenCount ?? usageMeta?.candidatesTokenCountDetails?.thoughtTokenCount ?? 0;
      const imageTokens = this.getOutputImageTokens(imageSize);
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
      requestManifest: {
        ...generateContentRequestDiagnostics,
        endpointUsed: 'generateContent',
        modelRequest: this.buildGenerateContentModelRequest(generateContentRequest),
      },
    };
  }

  private buildRequestDiagnostics(params: {
    providerRequestId: string;
    parts: any[];
    aspectRatio?: string;
    systemInstruction?: string;
    personGeneration?: string;
    imageSize?: string;
    promptLength: number;
    referenceCount: number;
    operationType: 'generate' | 'edit';
    operation?: string;
  }): Record<string, unknown> {
    const { parts } = params;
    const fileUriParts = parts.filter((part) => part?.fileData);
    const inlineImageParts = parts.filter((part) => part?.inlineData);
    const textParts = parts.filter((part) => typeof part?.text === 'string');
    const fullTextPrompt = textParts
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string' && text.length > 0)
      .join('\n\n');
    const unsupportedPartIndexes = parts
      .map((part, index) =>
        part?.text || part?.inlineData || part?.fileData ? null : { index, keys: Object.keys(part ?? {}) }
      )
      .filter(Boolean);
    const maybePersonGenerationSent = !!(params.personGeneration && this.supportsPersonGeneration());

    return {
      providerRequestId: params.providerRequestId,
      provider: 'gemini',
      model: this.model,
      operation: params.operation ?? (params.operationType === 'edit' ? 'image_edit' : 'image_generate'),
      operationType: params.operationType,
      mode: params.operationType,
      endpointPlan: 'generateContent',
      promptLength: params.promptLength,
      fullTextPromptLength: fullTextPrompt.length,
      fullTextPrompt,
      referenceCount: params.referenceCount,
      partsCount: parts.length,
      textPartsCount: textParts.length,
      fileUriPartsCount: fileUriParts.length,
      inlineImagePartsCount: inlineImageParts.length,
      unsupportedPartIndexes,
      fileUriParts: fileUriParts.map((part, index) => ({
        index,
        mimeType: part.fileData?.mimeType ?? null,
        fileUriSummary: this.summarizeUri(part.fileData?.fileUri),
      })),
      inlineImageParts: inlineImageParts.map((part, index) => ({
        index,
        mimeType: part.inlineData?.mimeType ?? null,
        dataLength: typeof part.inlineData?.data === 'string' ? part.inlineData.data.length : null,
      })),
      textParts: textParts.map((part, index) => ({
        index,
        textLength: part.text.length,
        textPreview: part.text.slice(0, 240),
      })),
      aspectRatio: params.aspectRatio ?? null,
      imageSize: params.imageSize || config.nanoBanana?.imageSize || '1K',
      hasSystemInstruction: !!params.systemInstruction,
      systemInstructionLength: params.systemInstruction?.length ?? 0,
      systemInstruction: params.systemInstruction ?? null,
      personGenerationRequested: params.personGeneration ?? null,
      personGenerationSent: maybePersonGenerationSent
        ? this.mapPersonGeneration(params.personGeneration!)
        : null,
      invalidArgumentHints: this.inferInvalidArgumentHints({
        referenceCount: params.referenceCount,
        fileUriPartsCount: fileUriParts.length,
        inlineImagePartsCount: inlineImageParts.length,
        unsupportedPartCount: unsupportedPartIndexes.length,
        aspectRatio: params.aspectRatio,
        personGenerationSent: maybePersonGenerationSent,
      }),
    };
  }

  private buildGenerateContentModelRequest(request: {
    model: string;
    contents: Array<{ role: string; parts: any[] }>;
    config: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      endpoint: 'models.generateContent',
      model: request.model,
      input: request.contents.flatMap((content) =>
        this.convertPartsToInteractionInput(content.parts).map((part) =>
          this.sanitizeModelInputPart(part)
        )
      ),
      config: this.sanitizeForLog(request.config),
    };
  }

  private sanitizeModelInputPart(part: any): Record<string, unknown> {
    if (part?.type === 'text') {
      return {
        type: 'text',
        text: typeof part.text === 'string' ? part.text : '',
      };
    }

    if (part?.type === 'image') {
      const sanitized: Record<string, unknown> = {
        type: 'image',
        mime_type: part.mime_type ?? 'image/png',
      };
      if (typeof part.uri === 'string') sanitized.uri = part.uri;
      if (typeof part.data === 'string') {
        sanitized.data = '[omitted base64 image payload]';
        sanitized.dataLength = part.data.length;
      }
      return sanitized;
    }

    return this.sanitizeForLog(part) as Record<string, unknown>;
  }

  private inferInvalidArgumentHints(params: {
    referenceCount: number;
    fileUriPartsCount: number;
    inlineImagePartsCount: number;
    unsupportedPartCount: number;
    aspectRatio?: string;
    personGenerationSent: boolean;
  }): string[] {
    const hints: string[] = [];
    const supportedAspectRatios = new Set([
      '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5',
      '5:4', '8:1', '9:16', '16:9', '21:9',
    ]);

    if (this.model.includes('lite') && params.referenceCount >= 4) {
      hints.push('Lite image model may reject heavy multi-reference scene requests; try complex image route/model.');
    }
    if (params.fileUriPartsCount > 0) {
      hints.push('Request uses Files API file URIs; verify the endpoint/model accepts fileData/file URIs for image generation.');
    }
    if (params.inlineImagePartsCount > 0) {
      hints.push('Request includes inline images; verify payload size and MIME types if Google does not return field-level details.');
    }
    if (params.unsupportedPartCount > 0) {
      hints.push('Request contains unsupported part shapes before SDK call.');
    }
    if (params.aspectRatio && !supportedAspectRatios.has(params.aspectRatio)) {
      hints.push(`Unsupported aspect ratio for Gemini image request: ${params.aspectRatio}.`);
    }
    if (params.personGenerationSent) {
      hints.push('personGeneration was sent; some Gemini image models reject this config.');
    }

    return hints;
  }

  private extractApiErrorDiagnostics(error: unknown): Record<string, unknown> {
    const err = error as Record<string, any> | null | undefined;
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;

    return {
      type: err?.constructor?.name ?? typeof error,
      name: err?.name ?? null,
      message: message ?? null,
      parsedMessage: this.tryParseJsonObject(message),
      status: err?.status ?? err?.statusCode ?? null,
      code: err?.code ?? null,
      details: this.sanitizeForLog(err?.details ?? null),
      keys: err && typeof err === 'object' ? Object.keys(err) : [],
      error: this.sanitizeForLog(err?.error ?? null),
      response: this.sanitizeForLog(err?.response ?? null),
      body: this.sanitizeForLog(err?.body ?? null),
      data: this.sanitizeForLog(err?.data ?? null),
      cause: this.sanitizeForLog(err?.cause ?? null),
      stack: error instanceof Error ? error.stack : null,
    };
  }

  private tryParseJsonObject(value?: string): unknown {
    if (!value) return null;
    const trimmed = value.trim();
    const firstBrace = trimmed.indexOf('{');
    if (firstBrace === -1) return null;

    try {
      return JSON.parse(trimmed.slice(firstBrace));
    } catch {
      return null;
    }
  }

  private sanitizeForLog(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value ?? null;
    if (depth > 4) return '[MaxDepth]';
    if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
    if (typeof value === 'string') {
      return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated ${value.length}]` : value;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 40).map((item) => this.sanitizeForLog(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('apikey') ||
        normalizedKey.includes('api_key') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('token')
      ) {
        result[key] = '[redacted]';
        continue;
      }
      if ((normalizedKey === 'data' || normalizedKey.includes('base64')) && typeof item === 'string') {
        result[key] = `[base64/string ${item.length} chars]`;
        continue;
      }
      if (
        (normalizedKey === 'systeminstruction' || normalizedKey === 'system_instruction') &&
        typeof item === 'string'
      ) {
        result[key] = item;
        continue;
      }
      result[key] = this.sanitizeForLog(item, depth + 1);
    }
    return result;
  }

  private summarizeUri(uri: unknown): Record<string, unknown> | null {
    if (typeof uri !== 'string') return null;
    try {
      const parsed = new URL(uri);
      return {
        protocol: parsed.protocol,
        host: parsed.host,
        pathPreview: parsed.pathname.slice(0, 120),
      };
    } catch {
      return {
        rawPreview: uri.slice(0, 160),
      };
    }
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
      throw new Error(`Unsupported Gemini image input part at index ${index}`);
    });
  }

  private isGemini31FlashImageFamily(): boolean {
    return (
      this.model.includes('gemini-3.1-flash-image') ||
      this.model.includes('gemini-3.1-flash-lite-image')
    );
  }
  
  /**
   * Estimate returned dimensions from Gemini image_size + aspect ratio.
   * Used for metadata only; the generated image bytes remain the source of truth.
   */
  private calculateDimensions(aspectRatio?: string, imageSizeOverride?: string): { width: number; height: number } {
    const normalizedAspectRatio = aspectRatio || '16:9';
    const imageSize = (imageSizeOverride || config.nanoBanana?.imageSize || '1K').toUpperCase();

    if (this.isGemini31FlashImageFamily()) {
      const dimensionsByImageSize: Record<string, Record<string, { width: number; height: number }>> = {
        '512': {
          '1:1': { width: 512, height: 512 },
          '1:4': { width: 256, height: 1024 },
          '1:8': { width: 192, height: 1536 },
          '2:3': { width: 424, height: 632 },
          '3:2': { width: 632, height: 424 },
          '3:4': { width: 448, height: 600 },
          '4:1': { width: 1024, height: 256 },
          '4:3': { width: 600, height: 448 },
          '4:5': { width: 464, height: 576 },
          '5:4': { width: 576, height: 464 },
          '8:1': { width: 1536, height: 192 },
          '9:16': { width: 384, height: 688 },
          '16:9': { width: 688, height: 384 },
          '21:9': { width: 792, height: 168 },
        },
        '1K': {
          '1:1': { width: 1024, height: 1024 },
          '1:4': { width: 512, height: 2048 },
          '1:8': { width: 384, height: 3072 },
          '2:3': { width: 848, height: 1264 },
          '3:2': { width: 1264, height: 848 },
          '3:4': { width: 896, height: 1200 },
          '4:1': { width: 2048, height: 512 },
          '4:3': { width: 1200, height: 896 },
          '4:5': { width: 928, height: 1152 },
          '5:4': { width: 1152, height: 928 },
          '8:1': { width: 3072, height: 384 },
          '9:16': { width: 768, height: 1376 },
          '16:9': { width: 1376, height: 768 },
          '21:9': { width: 1584, height: 672 },
        },
        '2K': {
          '1:1': { width: 2048, height: 2048 },
          '1:4': { width: 1024, height: 4096 },
          '1:8': { width: 768, height: 6144 },
          '2:3': { width: 1696, height: 2528 },
          '3:2': { width: 2528, height: 1696 },
          '3:4': { width: 1792, height: 2400 },
          '4:1': { width: 4096, height: 1024 },
          '4:3': { width: 2400, height: 1792 },
          '4:5': { width: 1856, height: 2304 },
          '5:4': { width: 2304, height: 1856 },
          '8:1': { width: 6144, height: 768 },
          '9:16': { width: 1536, height: 2752 },
          '16:9': { width: 2752, height: 1536 },
          '21:9': { width: 3168, height: 1344 },
        },
        '4K': {
          '1:1': { width: 4096, height: 4096 },
          '1:4': { width: 2048, height: 8192 },
          '1:8': { width: 1536, height: 12288 },
          '2:3': { width: 3392, height: 5056 },
          '3:2': { width: 5056, height: 3392 },
          '3:4': { width: 3584, height: 4800 },
          '4:1': { width: 8192, height: 2048 },
          '4:3': { width: 4800, height: 3584 },
          '4:5': { width: 3712, height: 4608 },
          '5:4': { width: 4608, height: 3712 },
          '8:1': { width: 12288, height: 1536 },
          '9:16': { width: 3072, height: 5504 },
          '16:9': { width: 5504, height: 3072 },
          '21:9': { width: 6336, height: 2688 },
        },
      };
      const sizeKey =
        imageSize === '0.5K' || imageSize === '512' || imageSize === '512PX'
          ? '512'
          : imageSize === '2K' || imageSize === '4K'
            ? imageSize
            : '1K';
      return (
        dimensionsByImageSize[sizeKey]?.[normalizedAspectRatio] ||
        dimensionsByImageSize[sizeKey]?.['16:9'] ||
        dimensionsByImageSize['1K']['16:9']
      );
    }

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

    return dimensionsMap[normalizedAspectRatio] || dimensionsMap['16:9'];
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

  private getOutputImageTokens(imageSizeOverride?: string): number {
    if (this.model.includes('gemini-2.5-flash-image')) {
      return 1290;
    }

    const imageSize = (imageSizeOverride || config.nanoBanana?.imageSize || '1K').toUpperCase();
    if (this.isGemini31FlashImageFamily()) {
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
      'gemini-3.1-flash-lite-image',
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
