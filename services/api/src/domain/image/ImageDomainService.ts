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
  // NEW: Scene context from outline for action/situation depiction
  sceneGoal?: string; // What happens in this scene
  sceneBeats?: string[]; // Key moments/actions
  sceneEmotion?: string; // Primary emotion (happy/calm/curious/concerned)
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
 * Scene image generation with reference approach (Nano Banana Pro)
 * Uses AI-generated character descriptions + optional reference image
 */
export interface SceneImageWithReferenceRequest {
  visualPrompt: string;
  sceneId: number;
  sceneText?: string;
  ageGroup: string;
  style: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  
  // AI-generated character descriptions (from Gemini Vision analysis)
  characterDescriptions: Array<{
    name: string;
    detailedDescription: string; // From Gemini Vision
    clothing?: any;
    distinctiveFeatures?: string[];
  }>;
  
  // Reference images (NEW: Array to support multiple characters)
  // First scene uses one reference, later scenes may use multiple
  referenceImages?: Array<{
    url?: string; // Optional: storage URL (deprecated, prefer base64Data)
    base64Data?: string; // Preferred: base64-encoded image data
    mimeType?: string; // MIME type if using base64Data
    instructionText: string; // Instruction for maintaining consistency
  }>;
  
  // Scene context from outline
  sceneGoal?: string;
  sceneBeats?: string[];
  sceneEmotion?: string;
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
    
    // Extract scene characters if scene text provided
    const sceneCharacters = request.sceneText && request.characters
      ? extractSceneCharacters(request.sceneText, request.characters)
      : request.characters || [];
    
    // Determine if we need capability model (for reference images)
    const useCapabilityModel = request.mode === 'with_references' && 
                               request.referenceImages && 
                               request.referenceImages.length > 0;
    
    // Build negative prompt for safety (will be included in main prompt)
    const negativePrompt = buildNegativePrompt(request.ageGroup);
    
    // Build enhanced prompt with characters, style, and safety guidelines
    const enhancedPrompt = buildSceneImagePrompt({
      visualPrompt: request.visualPrompt,
      ageGroup: request.ageGroup,
      style: request.style || 'soft_watercolor',
      characters: sceneCharacters,
      hasReferences: useCapabilityModel,
      negativePrompt, // Include negative prompt in text
      // NEW: Pass scene context for action/situation depiction
      sceneGoal: request.sceneGoal,
      sceneBeats: request.sceneBeats,
      sceneEmotion: request.sceneEmotion,
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
   * Generate character portrait for consistency
   * Used when user doesn't provide reference photos (Premium plan)
   */
  async generateCharacterPortrait(request: CharacterPortraitRequest): Promise<GeneratedImage> {
    logger.info({ characterName: request.characterName }, 'Generating character portrait');

    // Build negative prompt for safety (will be included in main prompt)
    const negativePrompt = buildNegativePrompt(request.ageGroup);
    
    // Build portrait-specific prompt with safety guidelines included
    const prompt = buildCharacterPortraitPrompt({
      characterName: request.characterName,
      description: request.description,
      style: request.style,
      ageGroup: request.ageGroup,
      characterType: request.characterType,
      negativePrompt, // Include negative prompt in text
    });
    
    const providerRequest: GenerateImageRequest = {
      prompt,
      aspectRatio: '1:1', // Square portraits
      // Use 'allow_all' for children's portraits (allows all ages including children)
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
      characterCount: request.characterDescriptions.length
    }, 'Generating scene with reference approach');
    
    // Build character descriptions section from AI analysis
    const charactersSection = request.characterDescriptions
      .map(char => {
        let desc = `${char.name}: ${char.detailedDescription}`;
        
        // Add clothing if available
        if (char.clothing) {
          const clothingDesc = typeof char.clothing === 'string' 
            ? char.clothing 
            : JSON.stringify(char.clothing);
          desc += `, wearing ${clothingDesc}`;
        }
        
        // Add distinctive features if available
        if (char.distinctiveFeatures && char.distinctiveFeatures.length > 0) {
          desc += `, notable features: ${char.distinctiveFeatures.join(', ')}`;
        }
        
        return desc;
      })
      .join('\n');
    
    // Build negative prompt for safety
    const negativePrompt = buildNegativePrompt(request.ageGroup);
    
    // Build enhanced prompt (without old character system)
    let enhancedPrompt = buildSceneImagePrompt({
      visualPrompt: request.visualPrompt,
      ageGroup: request.ageGroup,
      style: request.style,
      characters: [], // Don't use old character reference system
      hasReferences: !!request.referenceImages && request.referenceImages.length > 0,
      negativePrompt,
      sceneGoal: request.sceneGoal,
      sceneBeats: request.sceneBeats,
      sceneEmotion: request.sceneEmotion,
    });
    
    // Add character descriptions to prompt
    if (charactersSection) {
      enhancedPrompt = `${enhancedPrompt}\n\nCHARACTERS IN THIS SCENE:\n${charactersSection}`;
    }
    
    // Add combined reference instruction if multiple references exist
    if (request.referenceImages && request.referenceImages.length > 0) {
      const referenceInstruction = request.referenceImages
        .map(ref => ref.instructionText)
        .join('\n\n');
      enhancedPrompt = `${referenceInstruction}\n\n${enhancedPrompt}`;
    }
    
    // Create provider request for Nano Banana Pro
    const providerRequest: GenerateImageRequest = {
      prompt: enhancedPrompt,
      aspectRatio: request.aspectRatio || '16:9',
      // Pass all reference images to provider
      referenceImages: request.referenceImages?.map(ref => ({
        url: ref.url,
        base64Data: ref.base64Data,
        mimeType: ref.mimeType,
        characterName: 'scene_reference' // Generic name for multiple refs
      })) || undefined
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

