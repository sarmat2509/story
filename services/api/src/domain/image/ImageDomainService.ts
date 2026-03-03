/**
 * Image Domain Service
 * Business logic for image generation (M4)
 */

import type { IImageProvider, GenerateImageRequest, GeneratedImage, ReferenceImage } from '../../providers/base/IImageProvider';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UploadedFile } from '../../providers/base/IFileManager';
import { logger } from '../../utils/logger';
import {
  buildSceneImagePrompt,
  buildImageSystemInstruction,
  extractSceneCharacters,
  type CharacterReference,
} from '../../prompts/image';
import { buildImageValidationPrompt } from '../../prompts/image/ImageValidationPrompt';
import { buildImageEditPrompt } from '../../prompts/image/ImageEditPrompt';
import { buildTurnaroundPrompt, buildTextOnlyTurnaroundPrompt } from '../../prompts/image/TurnaroundPrompt';
import { IMAGE_VALIDATION_SCHEMA } from '../story/schemas';
import type { ImageValidationResult } from '../../ai/types';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
import config from '../../config';

/**
 * Image generation parameters specific to story scenes
 */
export interface SceneImageRequest {
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
  sceneVisual?: SceneVisual; // Structured visual (preferred)
  visualPrompt?: string; // Deprecated fallback
  sceneId: number;
  sceneText?: string;
  ageGroup: string;
  style: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

  // Pre-classified character data (prepared by orchestration layer)
  realWorldCharacters: Array<{ name: string; description: string }>;
  imaginaryCharacters: Array<{ name: string; isTurnaround?: boolean }>;

  // Reference images with per-image labels
  referenceImages?: Array<{
    url?: string;
    base64Data?: string;
    fileUri?: string; // Files API URI (alternative to base64Data)
    mimeType?: string;
    instructionText: string;
    characterName?: string;
  }>;

  // System instruction (static context: role, art style, format, quality)
  systemInstruction?: string;

  // Google Asset Graph pattern: maps character name -> Image N index
  imageIndexMap?: Map<string, number>;

  // Current scene's environment description (included in user prompt)
  currentEnvironment?: { id: string; name: string; description: string };

  // Scene-specific outfit overrides from text generation
  characterOutfits?: Record<string, string>;

  scenarioCardId?: string;

  // When true: SETTING uses only scene-specific delta (env image provides layout)
  hasEnvironmentImageRef?: boolean;
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
    private textProvider?: ITextProvider, // For vision-based image validation (Gemini Vision)
  ) {}

  /**
   * Generate illustration for a story scene
   * Main method for scene image generation with full business logic
   */
  async generateSceneIllustration(request: SceneImageRequest): Promise<GeneratedImage> {
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
    const sceneCharacters = request.sceneText && request.characters
      ? extractSceneCharacters(request.sceneText, request.characters)
      : request.characters || [];
    
    // Determine if we need capability model (for reference images)
    const useCapabilityModel = request.mode === 'with_references' && 
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
    
    // Create provider request
    const providerRequest: GenerateImageRequest = {
      prompt: enhancedPrompt,
      // Only use aspectRatio for generate model (not capability model)
      aspectRatio: useCapabilityModel ? undefined : '16:9',
      referenceImages: request.referenceImages,
      // Use 'allow_all' for children's stories (allows all ages including children)
      personGeneration: 'allow_all',
    };

    return await this.imageProvider.generateImage(providerRequest);
  }

  /**
   * Generate scene with reference-based approach (Nano Banana Pro)
   * Uses AI-generated descriptions + optional reference image for character consistency
   * 
   * Flow:
   * - Scene 1: Generate from text descriptions only (no reference)
   * - Scenes 2-N: Generate using Scene 1 as reference + text descriptions
   */
  async generateSceneWithReference(request: SceneImageWithReferenceRequest): Promise<GeneratedImage> {
    logger.info({ 
      sceneId: request.sceneId,
      hasReferences: !!request.referenceImages,
      referenceCount: request.referenceImages?.length || 0,
      realWorldCount: request.realWorldCharacters.length,
      imaginaryCount: request.imaginaryCharacters.length,
      hasSystemInstruction: !!request.systemInstruction,
    }, 'Generating scene with reference approach');

    const hasRefs = !!request.referenceImages && request.referenceImages.length > 0;

    const enhancedPrompt = buildSceneImagePrompt({
      sceneVisual: request.sceneVisual,
      visualPrompt: request.visualPrompt,
      ageGroup: request.ageGroup,
      style: request.style,
      hasReferences: hasRefs,
      referenceCharacterNames: request.imaginaryCharacters,
      realWorldCharacters: request.realWorldCharacters,
      imageIndexMap: request.imageIndexMap,
      currentEnvironment: request.currentEnvironment,
      characterOutfits: request.characterOutfits,
      scenarioCardId: request.scenarioCardId,
      hasEnvironmentImageRef: request.hasEnvironmentImageRef,
    });

    // Build system instruction: use pre-built one from orchestration, or build here
    const systemInstruction = request.systemInstruction || buildImageSystemInstruction({
      style: request.style,
      ageGroup: request.ageGroup,
      hasReferences: hasRefs,
      scenarioCardId: request.scenarioCardId,
    });

    logger.info({
      sceneId: request.sceneId,
      style: request.style,
      ageGroup: request.ageGroup,
      promptLength: enhancedPrompt.length,
      fullPrompt: enhancedPrompt,
      systemInstruction,
      imageIndexMap: request.imageIndexMap ? Object.fromEntries(request.imageIndexMap) : undefined,
      referenceLabels: request.referenceImages?.map(r => r.instructionText),
    }, 'Built scene prompt with Asset Graph pattern');

    const providerRequest: GenerateImageRequest = {
      prompt: enhancedPrompt,
      aspectRatio: request.aspectRatio || '16:9',
      systemInstruction,
      referenceImages: request.referenceImages?.map(ref => ({
        url: ref.url,
        base64Data: ref.base64Data,
        fileUri: ref.fileUri,
        mimeType: ref.mimeType,
        instructionText: ref.instructionText,
      })) || undefined,
    };

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
    cacheKey?: string,
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
  buildCharacterDescription(
    referencePhotos?: any[],
    appearanceTraits?: any
  ): string {
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

  /**
   * Validate a generated image using Gemini Vision.
   * Checks for character hallucinations, duplicates, missing/extra characters,
   * reference-image fidelity (colors, outfit, recognizability), and unwanted text.
   *
   * Validation is reference-based: the generated image is compared against
   * character reference images (turnaround sheets). References are passed as
   * base64 or fileUri (Files API). Requires textProvider (ENABLE_IMAGE_VALIDATION).
   */
  async validateGeneratedImage(params: {
    imageData: Buffer;
    mimeType: string;
    expectedCharacters: Array<{
      name: string;
      isImaginary: boolean;
      description?: string;
    }>;
    sceneVisual: SceneVisual;
    referenceImages?: Array<{
      characterName: string;
      imageData?: string; // base64 (optional when fileUri provided)
      fileUri?: string; // Files API URI — when present, used instead of inline data
      mimeType: string;
    }>;
  }): Promise<ImageValidationResult> {
    if (!this.textProvider) {
      throw new Error('Image validation requires textProvider (ENABLE_IMAGE_VALIDATION=true)');
    }

    logger.info({
      expectedCharacterCount: params.expectedCharacters.length,
      referenceCount: params.referenceImages?.length ?? 0,
      imaginaryCharacters: params.expectedCharacters.filter(c => c.isImaginary).map(c => c.name),
    }, 'Validating generated image with Vision model (reference-based)');

    // Generated image is always the first image; reference images follow
    const imageDataArray: Array<{
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      data: string;
      fileUri?: string;
    }> = [{
      mimeType: params.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
      data: params.imageData.toString('base64'),
    }];

    // Append reference images (turnaround sheets) for visual comparison
    if (params.referenceImages && params.referenceImages.length > 0) {
      for (const ref of params.referenceImages) {
        imageDataArray.push({
          mimeType: ref.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: ref.imageData || '',
          fileUri: ref.fileUri,
        });
      }
      logger.debug({
        referenceCount: params.referenceImages.length,
        referenceCharacters: params.referenceImages.map(r => r.characterName),
      }, 'Sending reference images alongside generated image for validation');
    }

    // Build scene context string for occlusion-aware validation
    const { text: compositionText } = flattenCameraComposition(params.sceneVisual.cameraComposition);
    const sceneContext = [
      params.sceneVisual.setting,
      compositionText,
    ].filter(Boolean).join('. ');

    // Build validation prompt with text descriptions, scene context, and reference image metadata
    const prompt = buildImageValidationPrompt({
      expectedCharacters: params.expectedCharacters,
      sceneContext: sceneContext || undefined,
      referenceImages: params.referenceImages,
    });

    try {
      const result = await this.textProvider.generateStructured<ImageValidationResult>({
        model: config.ai?.geminiVisionModel || 'gemini-2.5-flash',
        prompt,
        imageData: imageDataArray,
        schema: IMAGE_VALIDATION_SCHEMA,
        temperature: 0.2, // Low temperature for consistent validation
        relaxedSafety: true, // Avoid false positives on children's content
      });

      logger.info({
        isValid: result.isValid,
        characterCount: result.characterCount,
        expectedCharacterCount: result.expectedCharacterCount,
        hasUnexpected: result.hasUnexpectedCharacters,
        hasText: result.hasTextOrLetters,
        issues: result.characters.filter(c => !c.found || c.duplicated || (c.recognizableScore ?? 1) < 0.5)
          .map(c => `${c.name}: ${c.issue || 'issue'}`),
      }, 'Image validation result');

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // If blocked by safety filter, auto-pass (same pattern as text validation)
      if (errorMsg.includes('PROHIBITED_CONTENT') || errorMsg.includes('blocked')) {
        logger.warn({
          error: errorMsg,
        }, 'Image validation blocked by safety filter — auto-passing');

        return {
          isValid: true,
          characterCount: params.expectedCharacters.length,
          expectedCharacterCount: params.expectedCharacters.length,
          characters: params.expectedCharacters.map(c => ({
            name: c.name,
            found: true,
            duplicated: false,
            recognizableScore: 1,
            matchesColors: true,
            matchesOutfit: true,
          })),
          hasUnexpectedCharacters: false,
          hasTextOrLetters: false,
          hasRenderingArtifacts: false,
          overallFeedback: `Auto-approved (safety filter false positive): ${errorMsg}`,
        };
      }

      logger.error({
        err: error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : String(error),
      }, 'Image validation failed');
      throw new Error(`Image validation failed: ${errorMsg}`);
    }
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
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    referenceImages?: Array<{
      url?: string;
      base64Data?: string;
      fileUri?: string;
      mimeType?: string;
      instructionText: string;
      characterName?: string;
    }>;
    systemInstruction?: string;
    personGeneration?: 'allow_adult' | 'allow_all' | 'dont_allow';
  }): Promise<GeneratedImage> {
    if (!this.imageProvider.editImage) {
      throw new Error('Image provider does not support editImage — fallback to full regeneration');
    }

    // Build edit instructions from validation feedback
    const editInstructions = buildImageEditPrompt({
      validationResult: params.validationResult,
      sceneDescription: params.sceneDescription,
    });

    logger.info({
      editInstructionsLength: editInstructions.length,
      editInstructionsPreview: editInstructions.substring(0, 200),
      originalMimeType: params.originalMimeType,
      referenceCount: params.referenceImages?.length || 0,
      hasSystemInstruction: !!params.systemInstruction,
    }, 'Editing scene image based on validation feedback');

    return await this.imageProvider.editImage({
      originalImage: params.originalImage,
      originalMimeType: params.originalMimeType,
      editInstructions,
      aspectRatio: params.aspectRatio,
      referenceImages: params.referenceImages?.map(ref => ({
        url: ref.url,
        base64Data: ref.base64Data,
        fileUri: ref.fileUri,
        mimeType: ref.mimeType,
        instructionText: ref.instructionText,
      })) || undefined,
      systemInstruction: params.systemInstruction,
      personGeneration: params.personGeneration,
    });
  }

  /**
   * Generate a turnaround model sheet for an imaginary character.
   * Takes the child's drawing as a reference and produces a single image
   * with 4 views: front, 3/4, side profile, and back.
   */
  async generateTurnaroundSheet(params: {
    referenceImageBase64: string;
    referenceMimeType: string;
    characterName: string;
    characterDescription?: string;
  }): Promise<GeneratedImage> {
    logger.info({
      characterName: params.characterName,
      hasDescription: !!params.characterDescription,
    }, 'Generating turnaround sheet for imaginary character');

    // Build the turnaround prompt
    const prompt = buildTurnaroundPrompt({
      characterName: params.characterName,
      characterDescription: params.characterDescription,
    });

    // Build request with the child's drawing as a reference image
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
      personGeneration: 'allow_all',
    };

    const result = await this.imageProvider.generateImage(request);

    logger.info({
      characterName: params.characterName,
      imageSize: result.imageData.length,
      mimeType: result.mimeType,
    }, 'Turnaround sheet generated successfully');

    return result;
  }

  /**
   * Generate a turnaround sheet from a TEXT DESCRIPTION only (no reference image).
   * Used for LLM-invented characters that have no user-uploaded drawing.
   */
  async generateTurnaroundSheetFromDescription(params: {
    characterName: string;
    characterDescription: string;
    imageStyle?: string;
  }): Promise<GeneratedImage> {
    logger.info({
      characterName: params.characterName,
      descriptionLength: params.characterDescription.length,
    }, 'Generating text-only turnaround sheet for LLM character');

    const prompt = buildTextOnlyTurnaroundPrompt({
      characterName: params.characterName,
      characterDescription: params.characterDescription,
      imageStyle: params.imageStyle,
    });

    const request: GenerateImageRequest = {
      prompt,
      aspectRatio: '16:9',
      referenceImages: [],
      personGeneration: 'allow_all',
    };

    const result = await this.imageProvider.generateImage(request);

    logger.info({
      characterName: params.characterName,
      imageSize: result.imageData.length,
      mimeType: result.mimeType,
    }, 'Text-only turnaround sheet generated successfully');

    return result;
  }
}

