/**
 * Image Domain Service
 * Business logic for image generation (M4)
 */

import type {
  IImageProvider,
  GenerateImageRequest,
  GeneratedImage,
  ImageAspectRatio,
  ReferenceImage,
  EditImageRequest,
} from '../../providers/base/IImageProvider';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';

export interface ImageDomainOptions {
  onUsage?: (usage: UsageMetadata) => void;
  onBuiltPrompt?: (payload: BuiltScenePromptPayload) => void | Promise<void>;
}
import type { UploadedFile } from '../../providers/base/IFileManager';
import { stripCharacterIdFromName } from '@wondertales/shared';
import { logger } from '../../utils/logger';
import {
  buildSceneImagePrompt,
  buildImageSystemInstruction,
  extractSceneCharacters,
  type CharacterReference,
} from '../../prompts/image';
import {
  buildImageEditPrompt,
  type ImageEditRepairManifest,
} from '../../prompts/image/ImageEditPrompt';
import {
  buildTurnaroundPrompt,
  buildTextOnlyTurnaroundPrompt,
} from '../../prompts/image/TurnaroundPrompt';
import type { ImageValidationResult } from '../../ai/types';
import { type SceneVisual } from '../../services/types';
import config from '../../config';
import {
  runGraphicNovelPanelImageValidation,
  runSegmentedProductImageValidation,
  type GraphicNovelPanelImageValidationResult,
  type GraphicNovelPanelValidationInput,
} from './imageValidationRun';
import { inferReferenceKind } from '../../utils/referenceImageKind';

export interface BuiltScenePromptPayload {
  primaryRead?: string;
  prompt: string;
  systemInstruction?: string;
  aspectRatio?: ImageAspectRatio;
  referenceImages?: Array<{
    instructionText?: string;
    characterName?: string;
    referenceKind?: 'character' | 'object';
    referenceBindingId?: string;
    imageIndex?: number;
    mimeType?: string;
    fileUri?: string;
    hasBase64Data: boolean;
    url?: string;
    storagePath?: string;
    source?: string;
    type?: string;
    environmentId?: string;
    referenceEnvironmentId?: string;
    outfitId?: string;
  }>;
}

/**
 * Image generation parameters specific to story scenes
 */
export interface SceneImageRequest {
  primaryRead?: string;
  sceneVisual?: SceneVisual; // Structured visual (preferred)
  visualPrompt?: string; // Deprecated fallback
  sceneId?: number;
  sceneText?: string; // For character extraction
  ageGroup: string;
  style?: string;
  characters?: CharacterReference[];
  referenceImages?: ReferenceImage[];
  mode?: 'with_references' | 'without_references';
  scenarioCardId?: string;
}

/**
 * Scene image generation with reference approach (Nano Banana Pro)
 * Uses AI-generated character descriptions + optional reference image
 */
export interface SceneImageWithReferenceRequest {
  primaryRead?: string;
  sceneVisual?: SceneVisual; // Structured visual (preferred)
  visualPrompt?: string; // Deprecated fallback
  sceneId: number;
  sceneText?: string;
  ageGroup: string;
  style: string;
  aspectRatio?: ImageAspectRatio;

  // Legacy text-only identities are rejected for final scene generation.
  realWorldCharacters: Array<{ name: string; description: string; nameAliases?: string[] }>;
  // Every entry must have a delivered turnaround reference.
  imaginaryCharacters: Array<{ name: string; isTurnaround?: boolean; nameAliases?: string[] }>;

  // Reference images with per-image labels
  referenceImages?: Array<{
    url?: string;
    base64Data?: string;
    fileUri?: string; // Files API URI (alternative to base64Data)
    mimeType?: string;
    instructionText: string;
    characterName?: string;
    source?: string;
    type?: string;
    imageIndex?: number;
    referenceBindingId?: string;
    referenceKind?: 'character' | 'object';
    environmentId?: string;
    referenceEnvironmentId?: string;
    outfitId?: string;
    storagePath?: string;
  }>;

  // System instruction (static context: role, art style, format, quality)
  systemInstruction?: string;

  // Google Asset Graph pattern: maps character name -> Image N index
  imageIndexMap?: Map<string, number>;

  // Current scene's environment description (included in user prompt)
  currentEnvironment?: { id: string; name: string; description: string };

  scenarioCardId?: string;

  // When true: SETTING uses only scene-specific delta (env image provides layout)
  hasEnvironmentImageRef?: boolean;
}

export interface MapTileImageRequest {
  prompt: string;
  systemInstruction?: string;
  maskImage: {
    buffer: Buffer;
    mimeType: string;
    instructionText?: string;
  };
  storyReferenceImages?: Array<{
    buffer: Buffer;
    mimeType: string;
    instructionText: string;
  }>;
}

/**
 * ImageDomainService - Business logic for image generation
 *
 * Responsibilities:
 * - Calculate optimal image dimensions based on age group
 * - Build age-appropriate art styles
 * - Enhance visual prompts with character descriptions and safety guidelines
 * - Handle character reference generation
 * - Apply negative prompts to filter inappropriate content
 */
export class ImageDomainService {
  constructor(
    private imageProvider: IImageProvider,
    private textProvider?: ITextProvider, // Primary provider for vision-based image validation
    private fallbackTextProvider?: ITextProvider // Optional secondary provider when primary validation is blocked
  ) {}

  /**
   * Generate illustration for a story scene
   * Main method for scene image generation with full business logic
   */
  async generateSceneIllustration(
    request: SceneImageRequest,
    options?: ImageDomainOptions
  ): Promise<GeneratedImage> {
    logger.info(
      {
        sceneId: request.sceneId,
        hasCharacters: !!request.characters?.length,
        hasReferences: !!request.referenceImages?.length,
        mode: request.mode,
      },
      'Generating scene illustration'
    );

    // Extract scene characters if scene text provided
    const sceneCharacters =
      request.sceneText && request.characters
        ? extractSceneCharacters(request.sceneText, request.characters)
        : request.characters || [];

    // Determine if we need capability model (for reference images)
    const useCapabilityModel =
      request.mode === 'with_references' &&
      request.referenceImages &&
      request.referenceImages.length > 0;

    // Build enhanced prompt with characters, style, and safety guidelines (contentPolicy handles negative prompt internally)
    const enhancedPrompt = buildSceneImagePrompt({
      sceneVisual: request.sceneVisual,
      visualPrompt: request.visualPrompt,
      ageGroup: request.ageGroup,
      style: request.style || 'soft_watercolor',
      characters: sceneCharacters,
      hasReferences: useCapabilityModel,
      scenarioCardId: request.scenarioCardId,
    });
    const systemInstruction = buildImageSystemInstruction({
      style: request.style || 'soft_watercolor',
      ageGroup: request.ageGroup,
      hasReferences: useCapabilityModel,
      scenarioCardId: request.scenarioCardId,
    });

    // Create provider request
    const providerRequest: GenerateImageRequest = {
      prompt: enhancedPrompt,
      // Only use aspectRatio for generate model (not capability model)
      aspectRatio: useCapabilityModel ? undefined : '16:9',
      referenceImages: request.referenceImages,
      // Use 'allow_all' for children's stories (allows all ages including children)
      personGeneration: 'allow_all',
      onUsage: options?.onUsage,
      operation: 'image_generate',
      systemInstruction,
    };

    return this.generateImageWithInstructions(providerRequest);
  }

  /**
   * Generate scene with reference-based approach (Nano Banana Pro)
   * Character identity is always grounded by delivered turnaround references.
   */
  async generateSceneWithReference(
    request: SceneImageWithReferenceRequest,
    options?: ImageDomainOptions
  ): Promise<GeneratedImage> {
    logger.info(
      {
        sceneId: request.sceneId,
        hasReferences: !!request.referenceImages,
        referenceCount: request.referenceImages?.length || 0,
        realWorldCount: request.realWorldCharacters.length,
        imaginaryCount: request.imaginaryCharacters.length,
        hasSystemInstruction: !!request.systemInstruction,
      },
      'Generating scene with reference approach'
    );

    if ((request.realWorldCharacters ?? []).length > 0) {
      throw new Error(
        `Scene ${request.sceneId} contains text-only character identities; final scene generation requires turnaround references`
      );
    }

    const referenceNames = new Set(
      (request.referenceImages || [])
        .filter((reference) => reference.referenceKind === 'character')
        .map((reference) =>
          stripCharacterIdFromName(reference.characterName || '')
            .trim()
            .toLocaleLowerCase()
        )
        .filter(Boolean)
    );
    const missingTurnarounds = (request.imaginaryCharacters ?? [])
      .filter((character) => {
        const name = stripCharacterIdFromName(character.name).trim().toLocaleLowerCase();
        return !character.isTurnaround || !referenceNames.has(name);
      })
      .map((character) => character.name);
    if (missingTurnarounds.length > 0) {
      throw new Error(
        `Scene ${request.sceneId} is missing required delivered turnaround references: ${missingTurnarounds.join(', ')}`
      );
    }

    const hasRefs = !!request.referenceImages && request.referenceImages.length > 0;

    const enhancedPrompt = buildSceneImagePrompt({
      sceneVisual: request.sceneVisual,
      visualPrompt: request.visualPrompt,
      ageGroup: request.ageGroup,
      style: request.style,
      hasReferences: hasRefs,
      referenceCharacterNames: request.imaginaryCharacters,
      realWorldCharacters: [],
      imageIndexMap: request.imageIndexMap,
      referenceImages: request.referenceImages,
      currentEnvironment: request.currentEnvironment,
      scenarioCardId: request.scenarioCardId,
      hasEnvironmentImageRef: request.hasEnvironmentImageRef,
    });

    // Build system instruction from the actual per-scene reference set so env-ref rules
    // are included only when this scene really carries an environment image.
    const systemInstruction = buildImageSystemInstruction({
      style: request.style,
      ageGroup: request.ageGroup,
      hasReferences: hasRefs,
      hasEnvironmentReference: !!request.hasEnvironmentImageRef,
      scenarioCardId: request.scenarioCardId,
    });

    logger.info(
      {
        sceneId: request.sceneId,
        style: request.style,
        ageGroup: request.ageGroup,
        promptLength: enhancedPrompt.length,
        fullPrompt: enhancedPrompt,
        systemInstruction,
        imageIndexMap: request.imageIndexMap
          ? Object.fromEntries(request.imageIndexMap)
          : undefined,
        referenceLabels: request.referenceImages?.map((r) => r.instructionText),
      },
      'Built scene prompt with Asset Graph pattern'
    );

    const refImages =
      request.referenceImages?.map((ref) => ({
        url: ref.url,
        base64Data: ref.base64Data,
        fileUri: ref.fileUri,
        mimeType: ref.mimeType,
        instructionText: ref.instructionText,
        characterName: ref.characterName,
        referenceBindingId: ref.referenceBindingId,
        imageIndex: ref.imageIndex,
        source: ref.source,
        type: ref.type,
        environmentId: ref.environmentId,
        referenceEnvironmentId: ref.referenceEnvironmentId,
        outfitId: ref.outfitId,
        storagePath: ref.storagePath,
        referenceKind:
          ref.referenceKind ??
          inferReferenceKind({
            source: ref.source,
            type: (ref as { type?: string }).type,
          }),
      })) || undefined;

    const characterRefCount = refImages?.filter((r) => r.referenceKind === 'character').length ?? 0;
    const objectRefCount = refImages?.filter((r) => r.referenceKind === 'object').length ?? 0;
    logger.info(
      {
        sceneId: request.sceneId,
        referenceKindCharacterCount: characterRefCount,
        referenceKindObjectCount: objectRefCount,
        referenceTotal: refImages?.length ?? 0,
      },
      'Reference images passed to image provider (by kind)'
    );

    const providerRequest: GenerateImageRequest = {
      prompt: enhancedPrompt,
      aspectRatio: request.aspectRatio || '16:9',
      systemInstruction,
      referenceImages: refImages,
      onUsage: options?.onUsage,
      operation: 'image_generate',
    };

    await options?.onBuiltPrompt?.({
      primaryRead: request.primaryRead,
      prompt: enhancedPrompt,
      systemInstruction,
      aspectRatio: providerRequest.aspectRatio,
      referenceImages: refImages?.map((ref) => ({
        instructionText: ref.instructionText,
        characterName: ref.characterName,
        referenceKind: ref.referenceKind,
        referenceBindingId: ref.referenceBindingId,
        imageIndex: (ref as { imageIndex?: number }).imageIndex,
        mimeType: ref.mimeType,
        fileUri: ref.fileUri,
        hasBase64Data: !!ref.base64Data,
        url: ref.url,
        storagePath: ref.storagePath,
        source: ref.source,
        type: ref.type,
        environmentId: ref.environmentId,
        referenceEnvironmentId: ref.referenceEnvironmentId,
        outfitId: ref.outfitId,
      })),
    });

    return this.generateImageWithInstructions(providerRequest);
  }

  /**
   * Generate a square story reward map tile from a strict geometry mask.
   *
   * The mask is passed as Image 1 / object reference. The system instruction
   * carries stable tile rules; the prompt carries story-specific geometry and brief.
   */
  async generateMapTile(
    request: MapTileImageRequest,
    options?: ImageDomainOptions
  ): Promise<GeneratedImage> {
    const providerRequest: GenerateImageRequest = {
      prompt: request.prompt,
      systemInstruction: request.systemInstruction,
      aspectRatio: '1:1',
      referenceImages: [
        {
          base64Data: request.maskImage.buffer.toString('base64'),
          mimeType: request.maskImage.mimeType,
          instructionText:
            request.maskImage.instructionText ??
            'Image 1 is the strict geometry control map. Preserve its connector geometry exactly.',
          referenceKind: 'object',
        },
        ...(request.storyReferenceImages?.map((ref) => ({
          base64Data: ref.buffer.toString('base64'),
          mimeType: ref.mimeType,
          instructionText: ref.instructionText,
          referenceKind: 'object' as const,
        })) ?? []),
      ],
      personGeneration: 'dont_allow',
      onUsage: options?.onUsage,
      operation: 'image_map_tile',
    };

    await options?.onBuiltPrompt?.({
      prompt: request.prompt,
      systemInstruction: request.systemInstruction,
      aspectRatio: providerRequest.aspectRatio,
      referenceImages: providerRequest.referenceImages?.map((ref) => ({
        instructionText: ref.instructionText,
        characterName: ref.characterName,
        referenceKind: ref.referenceKind,
        referenceBindingId: ref.referenceBindingId,
        imageIndex: ref.imageIndex,
        mimeType: ref.mimeType,
        fileUri: ref.fileUri,
        hasBase64Data: !!ref.base64Data,
        url: ref.url,
        storagePath: ref.storagePath,
        source: (ref as { source?: string }).source,
        type: (ref as { type?: string }).type,
        environmentId: (ref as { environmentId?: string }).environmentId,
        referenceEnvironmentId: (ref as { referenceEnvironmentId?: string }).referenceEnvironmentId,
        outfitId: (ref as { outfitId?: string }).outfitId,
      })),
    });

    return await this.imageProvider.generateImage(providerRequest);
  }

  /**
   * Upload a reference file to the provider's file storage (e.g., Google Files API).
   * Returns the uploaded file metadata (including URI) or null if the provider
   * does not support file uploads.
   *
   * @param buffer      - Raw file data
   * @param mimeType    - MIME type (e.g. 'image/jpeg')
   * @param displayName - Optional human-readable name
   * @param cacheKey    - Optional cache key (e.g. storage path) to avoid re-uploads
   */
  async uploadReferenceFile(
    buffer: Buffer,
    mimeType: string,
    displayName?: string,
    cacheKey?: string
  ): Promise<UploadedFile | null> {
    const fileManager = this.imageProvider.getFileManager?.();
    if (!fileManager) {
      logger.debug('Provider does not support file uploads — skipping');
      return null;
    }

    return fileManager.upload(buffer, mimeType, displayName, cacheKey);
  }

  /**
   * Delete a previously uploaded reference file from the provider's storage.
   * Fire-and-forget safe — errors are logged but not thrown.
   */
  async deleteUploadedFile(fileName: string): Promise<void> {
    const fileManager = this.imageProvider.getFileManager?.();
    if (!fileManager) return;

    try {
      await fileManager.delete(fileName);
    } catch (err) {
      logger.warn({ fileName, error: err }, 'Failed to delete uploaded file (non-critical)');
    }
  }

  /**
   * Extract reference photos from child profile and characters
   * Returns array of reference images for consistency
   */
  extractReferencePhotos(
    childProfile?: { referencePhotos?: any[] },
    characters?: CharacterReference[]
  ): ReferenceImage[] {
    const references: ReferenceImage[] = [];

    // Extract from child profile
    if (childProfile?.referencePhotos) {
      for (const photo of childProfile.referencePhotos) {
        if (photo.url) {
          references.push({
            url: photo.url,
            characterName: 'main_child',
          });
        }
      }
    }

    // Extract from characters
    if (characters) {
      for (const character of characters) {
        if (character.referencePhotos) {
          for (const photo of character.referencePhotos) {
            if (photo.url) {
              references.push({
                url: photo.url,
                characterName: character.name,
              });
            }
          }
        }
      }
    }

    return references;
  }

  /**
   * Build character description from reference photos and appearance traits
   * Used when API doesn't support direct reference images
   */
  buildCharacterDescription(referencePhotos?: any[], appearanceTraits?: any): string {
    const parts: string[] = [];

    // Build from appearance traits if available
    if (appearanceTraits) {
      if (appearanceTraits.hairColor) parts.push(`${appearanceTraits.hairColor} hair`);
      if (appearanceTraits.hairStyle) parts.push(`${appearanceTraits.hairStyle} hairstyle`);
      if (appearanceTraits.eyeColor) parts.push(`${appearanceTraits.eyeColor} eyes`);
      if (appearanceTraits.skinTone) parts.push(`${appearanceTraits.skinTone} skin`);
      if (appearanceTraits.height) parts.push(appearanceTraits.height);
      if (appearanceTraits.build) parts.push(appearanceTraits.build);
      if (appearanceTraits.clothingStyle) parts.push(appearanceTraits.clothingStyle);
    }

    // Note: For MVP, we don't analyze reference photos
    // In future, could use Vision API to extract description from photos

    return parts.join(', ');
  }

  /**
   * Enhance visual prompt with context
   * Adds safety guidelines and age-appropriate language
   */
  enhanceVisualPrompt(prompt: string, context: { ageGroup: string }): string {
    // Visual prompt is already enhanced by buildSceneImagePrompt
    // This method is for additional enhancements if needed
    return prompt;
  }

  /**
   * Calculate optimal image dimensions based on age group
   * Younger children: simpler, lower resolution OK
   * Older children: more detail, higher resolution beneficial
   */
  calculateImageDimensions(ageGroup: string): { width: number; height: number } {
    // All age groups use 16:9 aspect ratio (1024x576) for consistency
    // This is optimal for story scenes and works well with Imagen 3

    switch (ageGroup) {
      case '0-1':
      case '1y':
        // Very young children - simple is better
        return { width: 1024, height: 576 };

      case '2-3':
      case '4-5':
        // Young children - standard quality
        return { width: 1024, height: 576 };

      case '6-8':
      case '9-12':
        // Older children - can appreciate more detail
        return { width: 1024, height: 576 };

      default:
        return { width: 1024, height: 576 };
    }
  }

  /**
   * Build image style based on age group and user preference
   * User preference takes priority if provided
   */
  buildImageStyle(ageGroup: string, userStyle?: string): string {
    // If user specified style, use it
    if (userStyle) {
      return userStyle;
    }

    // Otherwise, determine default based on age
    switch (ageGroup) {
      case '0-1':
      case '1y':
        return 'soft_watercolor'; // Gentlest, most soothing

      case '2-3':
        return 'colored_pencil'; // Simple, friendly

      case '4-5':
        return 'warm_3d'; // Engaging, familiar (like Pixar)

      case '6-8':
        return 'anime_light'; // More expressive, appealing to this age

      case '9-12':
        return 'comic_line'; // More sophisticated, action-oriented

      default:
        return 'soft_watercolor';
    }
  }

  async validateGeneratedImageSegmented(params: {
    imageData: Buffer;
    mimeType: string;
    expectedCharacters: Array<{
      characterRef?: string;
      name: string;
      characterKind: 'human' | 'animal' | 'imaginary';
      speciesSubtype?: string;
      description?: string;
      validateOutfit?: boolean;
    }>;
    sceneVisual: SceneVisual;
    referenceImages?: Array<{
      characterRef?: string;
      characterName: string;
      imageData?: string;
      fileUri?: string;
      mimeType: string;
      referenceKind?: 'identity' | 'layout_template';
      identitySource?: 'turnaround' | 'reference_photo' | 'dressed_turnaround';
    }>;
    logContext?: { storyId?: string; sceneId?: number; attempt?: number };
    onUsage?: (usage: UsageMetadata) => void;
    includeLayoutChecks?: boolean;
    includeBubbleChecks?: boolean;
    includeWardrobeChecks?: boolean;
  }): Promise<ImageValidationResult> {
    if (!this.textProvider) {
      throw new Error('Image validation requires textProvider (ENABLE_IMAGE_VALIDATION=true)');
    }

    return runSegmentedProductImageValidation(this.textProvider, params, {
      visionModel:
        config.ai?.validationModel || config.ai?.geminiVisionModel || 'gemini-3.1-flash-lite',
      fallbackTextProvider: this.fallbackTextProvider,
      fallbackVisionModel: config.ai?.openaiValidationModel || 'gpt-4o',
      operation: 'image_validation_segmented',
    });
  }

  async validateGraphicNovelPagePanels(
    params: GraphicNovelPanelValidationInput
  ): Promise<GraphicNovelPanelImageValidationResult> {
    if (!this.textProvider) {
      throw new Error('Graphic novel panel image validation requires textProvider');
    }

    return runGraphicNovelPanelImageValidation(this.textProvider, params, {
      visionModel:
        config.ai?.validationModel || config.ai?.geminiVisionModel || 'gemini-3.1-flash-lite',
      fallbackTextProvider: this.fallbackTextProvider,
      fallbackVisionModel: config.ai?.openaiValidationModel || 'gpt-4o',
      operation: 'image_validation_graphic_novel_panels',
    });
  }

  /**
   * Edit an existing generated image to fix validation issues.
   * Sends the original image + validation feedback as edit instructions to the provider.
   * Falls back to throwing if the provider does not support image editing.
   *
   * @param params - Original image, validation result, and generation context
   * @returns Corrected image
   */
  async editSceneImage(params: {
    originalImage: Buffer;
    originalMimeType: string;
    validationResult: ImageValidationResult;
    sceneDescription?: string;
    aspectRatio?: ImageAspectRatio;
    imageSize?: '512' | '0.5K' | '1K' | '2K' | '4K' | string;
    referenceImages?: Array<{
      url?: string;
      base64Data?: string;
      fileUri?: string;
      mimeType?: string;
      instructionText: string;
      characterName?: string;
      source?: string;
      type?: string;
      imageIndex?: number;
      referenceBindingId?: string;
      referenceKind?: 'character' | 'object';
      environmentId?: string;
      referenceEnvironmentId?: string;
      outfitId?: string;
      storagePath?: string;
    }>;
    systemInstruction?: string;
    targetedRepairManifest?: ImageEditRepairManifest;
    personGeneration?: 'allow_adult' | 'allow_all' | 'dont_allow';
    onUsage?: (usage: UsageMetadata) => void;
    operation?: string;
  }): Promise<GeneratedImage> {
    if (!this.imageProvider.editImage) {
      throw new Error('Image provider does not support editImage — fallback to full regeneration');
    }

    // Build edit instructions from validation feedback
    const editInstructions = buildImageEditPrompt({
      validationResult: params.validationResult,
      sceneDescription: params.sceneDescription,
      targetedRepairManifest: params.targetedRepairManifest,
    });

    logger.info(
      {
        editInstructionsLength: editInstructions.length,
        editInstructionsPreview: editInstructions.substring(0, 200),
        originalMimeType: params.originalMimeType,
        imageSize: params.imageSize,
        referenceCount: params.referenceImages?.length || 0,
        targetedRepairManifest: params.targetedRepairManifest ?? null,
        hasSystemInstruction: !!params.systemInstruction,
        operation: params.operation,
      },
      'Editing scene image based on validation feedback'
    );

    return await this.imageProvider.editImage({
      originalImage: params.originalImage,
      originalMimeType: params.originalMimeType,
      editInstructions,
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      referenceImages:
        params.referenceImages?.map((ref) => ({
          url: ref.url,
          base64Data: ref.base64Data,
          fileUri: ref.fileUri,
          mimeType: ref.mimeType,
          instructionText: ref.instructionText,
          characterName: ref.characterName,
          referenceBindingId: ref.referenceBindingId,
          imageIndex: ref.imageIndex,
          source: ref.source,
          type: ref.type,
          environmentId: ref.environmentId,
          referenceEnvironmentId: ref.referenceEnvironmentId,
          outfitId: ref.outfitId,
          storagePath: ref.storagePath,
          referenceKind:
            ref.referenceKind ??
            inferReferenceKind({ source: ref.source, type: (ref as { type?: string }).type }),
        })) || undefined,
      systemInstruction: params.systemInstruction,
      personGeneration: params.personGeneration,
      onUsage: params.onUsage,
      operation: params.operation ?? 'image_edit',
    });
  }

  async editImageWithInstructions(request: EditImageRequest): Promise<GeneratedImage> {
    if (!this.imageProvider.editImage) {
      throw new Error('Image provider does not support editImage');
    }

    logger.info(
      {
        originalMimeType: request.originalMimeType,
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        referenceCount: request.referenceImages?.length || 0,
        editInstructionsLength: request.editInstructions.length,
      },
      'Editing image with direct instructions'
    );

    return this.imageProvider.editImage({
      ...request,
      operation: request.operation || 'image_edit',
    });
  }

  async generateImageWithInstructions(request: GenerateImageRequest): Promise<GeneratedImage> {
    logger.info(
      {
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        referenceCount: request.referenceImages?.length || 0,
        promptLength: request.prompt.length,
        hasSystemInstruction: !!request.systemInstruction,
        operation: request.operation,
      },
      'Generating image with direct instructions'
    );

    return this.imageProvider.generateImage({
      ...request,
      operation: request.operation || 'image_generate',
    });
  }

  /**
   * Generate a turnaround model sheet for an imaginary character.
   * Takes the child's drawing as a reference and produces a single image
   * with 4 views: front, 3/4, side profile, and back.
   */
  async generateTurnaroundSheet(
    params: {
      referenceImageBase64: string;
      referenceMimeType: string;
      characterName: string;
      characterDescription?: string;
      currentAgeMonths?: number;
    },
    options?: ImageDomainOptions
  ): Promise<GeneratedImage> {
    logger.info(
      {
        characterName: params.characterName,
        hasDescription: !!params.characterDescription,
      },
      'Generating turnaround sheet for imaginary character'
    );

    // Build the turnaround prompt
    const prompt = buildTurnaroundPrompt({
      characterName: params.characterName,
      characterDescription: params.characterDescription,
      currentAgeMonths: params.currentAgeMonths,
    });

    // Build request with the child's drawing as a reference image.
    // Do NOT pass personGeneration: turnaround model (gemini-3-pro-image-preview) does not support it.
    const request: GenerateImageRequest = {
      prompt,
      aspectRatio: '16:9', // Wide format for 4 views side by side
      referenceImages: [
        {
          base64Data: params.referenceImageBase64,
          mimeType: params.referenceMimeType,
          instructionText: `This is the original drawing of "${params.characterName}". Preserve its exact appearance in all 4 turnaround views.`,
        },
      ],
      onUsage: options?.onUsage,
      operation: 'image_generate',
    };

    const result = await this.imageProvider.generateImage(request);

    logger.info(
      {
        characterName: params.characterName,
        imageSize: result.imageData.length,
        mimeType: result.mimeType,
      },
      'Turnaround sheet generated successfully'
    );

    return result;
  }

  /**
   * Generate a turnaround sheet from a TEXT DESCRIPTION only (no reference image).
   * Used for LLM-invented characters that have no user-uploaded drawing.
   */
  async generateTurnaroundSheetFromDescription(
    params: {
      characterName: string;
      characterDescription: string;
      imageStyle?: string;
      currentAgeMonths?: number;
    },
    options?: ImageDomainOptions
  ): Promise<GeneratedImage> {
    logger.info(
      {
        characterName: params.characterName,
        descriptionLength: params.characterDescription.length,
      },
      'Generating text-only turnaround sheet for LLM character'
    );

    const prompt = buildTextOnlyTurnaroundPrompt({
      characterName: params.characterName,
      characterDescription: params.characterDescription,
      imageStyle: params.imageStyle,
      currentAgeMonths: params.currentAgeMonths,
    });

    // Do NOT pass personGeneration: turnaround model (gemini-3-pro-image-preview) does not support it.
    const request: GenerateImageRequest = {
      prompt,
      aspectRatio: '16:9',
      referenceImages: [],
      onUsage: options?.onUsage,
      operation: 'image_generate',
    };

    const result = await this.imageProvider.generateImage(request);

    logger.info(
      {
        characterName: params.characterName,
        imageSize: result.imageData.length,
        mimeType: result.mimeType,
      },
      'Text-only turnaround sheet generated successfully'
    );

    return result;
  }
}
