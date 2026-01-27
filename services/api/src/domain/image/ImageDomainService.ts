/**
 * Image Domain Service
 * Business logic for image generation (M4)
 */

import type { IImageProvider, GenerateImageRequest, GeneratedImage, ReferenceImage } from '../../providers/base/IImageProvider';
import { logger } from '../../utils/logger';
import {
  buildSceneImagePrompt,
  buildNegativePrompt,
  buildCharacterPortraitPrompt,
  extractSceneCharacters,
  type CharacterReference,
} from '../../prompts/image';

/**
 * Image generation parameters specific to story scenes
 */
export interface SceneImageRequest {
  visualPrompt: string;
  sceneId?: number;
  sceneText?: string; // For character extraction
  ageGroup: string;
  style?: string;
  characters?: CharacterReference[];
  referenceImages?: ReferenceImage[];
  mode?: 'with_references' | 'without_references';
}

/**
 * Character portrait generation request
 */
export interface CharacterPortraitRequest {
  characterName: string;
  description: string;
  style: string;
  ageGroup: string;
  characterType?: string;
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
  constructor(private imageProvider: IImageProvider) {}

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

    // Calculate dimensions based on age group
    const dimensions = this.calculateImageDimensions(request.ageGroup);
    
    // Extract scene characters if scene text provided
    const sceneCharacters = request.sceneText && request.characters
      ? extractSceneCharacters(request.sceneText, request.characters)
      : request.characters || [];
    
    // Build enhanced prompt with characters and style
    const enhancedPrompt = buildSceneImagePrompt({
      visualPrompt: request.visualPrompt,
      ageGroup: request.ageGroup,
      style: request.style || 'soft_watercolor',
      characters: sceneCharacters,
      hasReferences: request.mode === 'with_references' && !!request.referenceImages?.length,
    });
    
    // Build negative prompt for safety
    const negativePrompt = buildNegativePrompt(request.ageGroup);
    
    // Create provider request
    const providerRequest: GenerateImageRequest = {
      prompt: enhancedPrompt,
      negativePrompt,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: '16:9',
      referenceImages: request.referenceImages,
    };

    return await this.imageProvider.generateImage(providerRequest);
  }

  /**
   * Generate character portrait for consistency
   * Used when user doesn't provide reference photos (Premium plan)
   */
  async generateCharacterPortrait(request: CharacterPortraitRequest): Promise<GeneratedImage> {
    logger.info({ characterName: request.characterName }, 'Generating character portrait');

    // Build portrait-specific prompt
    const prompt = buildCharacterPortraitPrompt({
      characterName: request.characterName,
      description: request.description,
      style: request.style,
      ageGroup: request.ageGroup,
      characterType: request.characterType,
    });
    
    const negativePrompt = buildNegativePrompt(request.ageGroup);
    
    // Use square aspect ratio for portraits
    const dimensions = { width: 768, height: 768 };
    
    const providerRequest: GenerateImageRequest = {
      prompt,
      negativePrompt,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: '1:1',
    };

    return await this.imageProvider.generateImage(providerRequest);
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
}

