/**
 * Character Analysis Service
 * Analyzes character photos using Gemini Vision API to extract detailed descriptions
 * 
 * Rules:
 * - Uses Gemini Vision to analyze reference photos
 * - Extracts structured appearance data, clothing, and distinctive features
 * - Returns null for any field that cannot be confidently determined from photos
 * - All analysis happens at save time (one-time cost per character)
 */

import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { logger } from '../utils/logger';
import { config } from '../config';
import { 
  FUR_COLORS, 
  FUR_PATTERNS, 
  FUR_LENGTHS, 
  PET_SIZES, 
  PET_EYE_COLORS,
  PET_DISTINCTIVE_FEATURES,
  HUMAN_HAIR_COLORS, 
  HUMAN_HAIR_LENGTHS, 
  HUMAN_HAIR_STYLES,
  EYE_COLORS, // из childTraits.ts
  SKIN_TONES, // из childTraits.ts
  FACE_SHAPES,
  HEIGHTS,
  BUILDS,
  CLOTHING_STYLES,
  CLOTHING_ITEMS,
  ACCESSORIES,
  CLOTHING_COLORS,
  AGE_RANGES,
  HUMAN_DISTINCTIVE_FEATURES,
  DISTINCTIVE_FEATURES as CHILD_DISTINCTIVE_FEATURES // ✅ Добавлен импорт для детей
} from '@kazka/shared';

/**
 * Helper to convert readonly array to enum with null
 */
const toEnumWithNull = <T extends readonly string[]>(arr: T): readonly [...T, null] => {
  return [...arr, null] as const;
};

/**
 * Age groups for character analysis (extends AGE_RANGES with infant/toddler)
 */
const CHARACTER_AGE_GROUPS = ['infant', 'toddler', ...AGE_RANGES] as const;

type ClothingStyleType = ExtractType<typeof CLOTHING_STYLES>;
type ClothingItemType = ExtractType<typeof CLOTHING_ITEMS>;
type AccessoryType = ExtractType<typeof ACCESSORIES>;
type ClothingColorType = ExtractType<typeof CLOTHING_COLORS>;

/**
 * Helper types extracted from constants
 */
type ExtractType<T extends readonly any[]> = T[number];

type HumanHairColorType = ExtractType<typeof HUMAN_HAIR_COLORS>;
type HumanHairStyleType = ExtractType<typeof HUMAN_HAIR_STYLES>;
type HumanHairLengthType = ExtractType<typeof HUMAN_HAIR_LENGTHS>;
type EyeColorType = ExtractType<typeof EYE_COLORS>;
type SkinToneType = ExtractType<typeof SKIN_TONES>;
type FaceShapeType = ExtractType<typeof FACE_SHAPES>;
type BuildType = ExtractType<typeof BUILDS>;
type HeightType = ExtractType<typeof HEIGHTS>;
type AgeGroupType = ExtractType<typeof CHARACTER_AGE_GROUPS>;

type FurColorType = ExtractType<typeof FUR_COLORS>;
type FurPatternType = ExtractType<typeof FUR_PATTERNS>;
type FurLengthType = ExtractType<typeof FUR_LENGTHS>;
type PetSizeType = ExtractType<typeof PET_SIZES>;
type PetEyeColorType = ExtractType<typeof PET_EYE_COLORS>;

/**
 * Input for character analysis
 */
export interface AnalyzeCharacterRequest {
  photos: string[]; // URLs of reference photos
  characterType: 'person' | 'animal' | 'imaginary';
  language?: string; // User's preferred language for description (e.g., 'uk', 'en', 'ru')
  existingTraits?: Record<string, any>; // Optional: existing appearance traits to refine
}

/**
 * Structured result from character analysis
 */
export interface CharacterAnalysisResult {
  // Flowing narrative description (always required)
  detailedDescription: string;
  
  // Structured characteristics (all nullable if not determinable from photos)
  appearanceTraits: {
    // For people
    hairColor?: HumanHairColorType | null;
    hairStyle?: HumanHairStyleType | null;
    hairLength?: HumanHairLengthType | null;
    eyeColor?: EyeColorType | null;
    skinTone?: SkinToneType | null;
    faceShape?: FaceShapeType | null;
    bodyType?: BuildType | null;
    height?: HeightType | null;
    age?: AgeGroupType | null;
    
    // For animals
    species?: string | null;
    breed?: string | null;
    furColor?: FurColorType | null;
    furPattern?: FurPatternType | null;
    furLength?: FurLengthType | null;
    size?: PetSizeType | null;
    eyeColorAnimal?: PetEyeColorType | null;
    
    // For fantasy creatures
    fantasyType?: string | null;
    magicalFeatures?: string[] | null;
  } | null;
  
  // Clothing and accessories (nullable if not visible)
  clothing: {
    style?: ClothingStyleType | 'fantasy' | null;
    colors?: ClothingColorType[] | null;
    distinctiveItems?: ClothingItemType[] | null;
    accessories?: AccessoryType[] | null;
  } | null;
  
  // Distinctive features (nullable if none detected)
  distinctiveFeatures: string[] | null;
}

/**
 * Service for analyzing character photos using Gemini Vision API
 */
export class CharacterAnalysisService {
  constructor(
    private textProvider: GeminiTextProvider
  ) {}
  
  /**
   * Analyze character from reference photos
   * Returns structured description and appearance data
   */
  async analyzeCharacter(request: AnalyzeCharacterRequest): Promise<CharacterAnalysisResult> {
    logger.info({ 
      photoCount: request.photos.length, 
      characterType: request.characterType 
    }, 'Starting character analysis with Gemini Vision');
    
    // 1. Download photos from URLs
    const photoBuffers = await Promise.all(
      request.photos.map(url => this.downloadImage(url))
    );
    
    // 2. Convert to base64 for Gemini Vision
    const imageData = photoBuffers.map(buffer => ({
      mimeType: 'image/jpeg' as const,
      data: buffer.toString('base64')
    }));
    
    // 3. Build analysis prompt
    const prompt = this.buildAnalysisPrompt(request.characterType, request.language || 'en', request.existingTraits);
    
    // 4. Call Gemini Vision API with structured output
    try {
      // Use gemini-1.5-flash or gemini-1.5-pro for vision + structured output
      // Note: gemini-2.0-flash-exp might not be available yet
    const result = await this.textProvider.generateStructured<CharacterAnalysisResult>({
      model: config.ai?.geminiVisionModel || 'gemini-2.5-flash', // Use configured vision model
      prompt,
      imageData, // Multiple images
      schema: this.getCharacterAnalysisSchema(request.characterType), // Pass characterType for proper enum
      temperature: 0.3, // Lower temperature for consistent analysis
      relaxedSafety: true, // ✅ Use ultra-relaxed safety for photo analysis
    });
      
      // Enforce array limits (in case AI returns more than allowed)
      if (result.distinctiveFeatures && result.distinctiveFeatures.length > 5) {
        logger.warn({ 
          field: 'distinctiveFeatures',
          original: result.distinctiveFeatures.length,
          trimmed: 5 
        }, 'Trimming array to max limit');
        result.distinctiveFeatures = result.distinctiveFeatures.slice(0, 5);
      }
      
      if (result.clothing) {
        if (result.clothing.colors && result.clothing.colors.length > 3) {
          logger.warn({ 
            field: 'clothing.colors',
            original: result.clothing.colors.length,
            trimmed: 3 
          }, 'Trimming array to max limit');
          result.clothing.colors = result.clothing.colors.slice(0, 3);
        }
        if (result.clothing.distinctiveItems && result.clothing.distinctiveItems.length > 5) {
          logger.warn({ 
            field: 'clothing.distinctiveItems',
            original: result.clothing.distinctiveItems.length,
            trimmed: 5 
          }, 'Trimming array to max limit');
          result.clothing.distinctiveItems = result.clothing.distinctiveItems.slice(0, 5);
        }
        if (result.clothing.accessories && result.clothing.accessories.length > 5) {
          logger.warn({ 
            field: 'clothing.accessories',
            original: result.clothing.accessories.length,
            trimmed: 5 
          }, 'Trimming array to max limit');
          result.clothing.accessories = result.clothing.accessories.slice(0, 5);
        }
      }
      
      if (result.appearanceTraits?.magicalFeatures && result.appearanceTraits.magicalFeatures.length > 10) {
        logger.warn({ 
          field: 'appearanceTraits.magicalFeatures',
          original: result.appearanceTraits.magicalFeatures.length,
          trimmed: 10 
        }, 'Trimming array to max limit');
        result.appearanceTraits.magicalFeatures = result.appearanceTraits.magicalFeatures.slice(0, 10);
      }
      
      logger.info({ 
        hasDescription: !!result.detailedDescription,
        hasAppearanceTraits: !!result.appearanceTraits,
        hasClothing: !!result.clothing,
        featuresCount: result.distinctiveFeatures?.length || 0
      }, 'Character analysis completed');
      
      return result;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : String(error),
        characterType: request.characterType,
        photoCount: request.photos.length
      }, 'Character analysis failed');
      throw new Error(`Failed to analyze character: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Build prompt for character analysis based on type
   */
  private buildAnalysisPrompt(
    characterType: 'person' | 'animal' | 'imaginary',
    language: string = 'en',
    existingTraits?: Record<string, any>
  ): string {
    const characterTypeLabel = characterType === 'person' ? 'person/human' : 
                               characterType === 'animal' ? 'animal/pet' : 
                               'imaginary creature';
    
    const languageMap: Record<string, string> = {
      'uk': 'Ukrainian',
      'ru': 'Russian',
      'en': 'English',
      'es': 'Spanish'
    };
    const languageName = languageMap[language] || 'English';
    
    const traitGuidance = characterType === 'person' ? `
   - Hair: color (${HUMAN_HAIR_COLORS.join('/')}), style (${HUMAN_HAIR_STYLES.join('/')}), length (${HUMAN_HAIR_LENGTHS.join('/')}) - return null if not visible
   - Eyes: color (${EYE_COLORS.join('/')}) - return null if not visible
   - Skin: tone (${SKIN_TONES.join('/')}) - return null if unclear
   - Face: shape (${FACE_SHAPES.join('/')}) - return null if unclear
   - Body: type (${BUILDS.join('/')}), height (${HEIGHTS.join('/')}) - return null if unclear
   - Age: approximate age group (${CHARACTER_AGE_GROUPS.join('/')}) - return null if unclear` :
    characterType === 'animal' ? `
   - Species and breed (if recognizable)
   - Fur/feathers color: choose from (${FUR_COLORS.join('/')}) - return null if not visible
   - Fur pattern: ${FUR_PATTERNS.join('/')} - return null if not visible
   - Fur length: ${FUR_LENGTHS.join('/')} - return null if not visible
   - Size: relative size (${PET_SIZES.join('/')})
   - Eye color (${PET_EYE_COLORS.join('/')}) - return null if not visible
   - Distinctive animal features (fluffy tail, short tail, white paws, floppy ears, etc.) - return null if none visible` : `
   - Fantasy creature type (dragon, unicorn, fairy, etc.)
   - Magical or unusual features (return null if none visible)
   - Color scheme (return null if colors unclear)
   - Size and proportions (return null if unclear)`;

    return `LEGITIMATE USE CASE: This analysis is for creating personalized children's storybook illustrations. The photos are uploaded by parents/guardians for their own children to appear as characters in educational stories.

Analyze the provided photo(s) and create a detailed character description for children's book illustration.

Character Type: ${characterTypeLabel}
Language: Write the DETAILED_DESCRIPTION in ${languageName}

IMPORTANT: Return null for ANY field that you cannot confidently determine from the photos. If a photo is unclear, blurry, or doesn't show certain features - return null for those fields. Only provide values you can clearly see and identify.

Please provide a comprehensive JSON response with the following structure:

1. DETAILED_DESCRIPTION: A flowing, narrative description of the character's appearance (2-3 sentences) in ${languageName}. This should be based ONLY on what is visible in the photos. If photos are very unclear, describe what you CAN see.

2. APPEARANCE_TRAITS: Structured characteristics (use null for unclear/invisible features):
${traitGuidance}

3. CLOTHING: (if applicable and visible)
   - Overall style: ${CLOTHING_STYLES.join('/')}/fantasy - return null if unclear
   - Colors: choose from (${CLOTHING_COLORS.join('/')}) - return null or empty array if not visible
   - Distinctive items: choose from (${CLOTHING_ITEMS.join('/')}) - return null or empty array if none visible
   - Accessories: choose from (${ACCESSORIES.join('/')}) - return null or empty array if none visible

4. DISTINCTIVE_FEATURES: Notable marks, expressions, or characteristics - MAX 5 items
   - For humans: choose from (${HUMAN_DISTINCTIVE_FEATURES.join('/')})
   - For children (person type): choose from (${CHILD_DISTINCTIVE_FEATURES.join('/')})
   - For animals: choose from (${PET_DISTINCTIVE_FEATURES.join('/')})
   - Return null or empty array if none visible
   - IMPORTANT: Select only the MOST distinctive features, maximum 5

Important guidelines:
- Return null for ANY field you cannot determine with confidence from the photos
- If a feature is not visible (e.g., eyes closed, face turned away) → return null
- If a feature is unclear due to photo quality → return null
- If colors are ambiguous or lighting makes them uncertain → return null
- Choose values from predefined lists where applicable, but use null if uncertain
- Be specific but concise for fields you CAN determine
- Focus on visual elements clearly visible in the photos
- Empty arrays [] are acceptable for lists with no items (e.g., no accessories visible)
- null is acceptable for entire sections (e.g., if no clothing visible, clothing: null)

${existingTraits ? `\nExisting traits (for reference, but trust your analysis more): ${JSON.stringify(existingTraits)}` : ''}

Return ONLY valid JSON matching this structure. Prefer null over guessing.`;
  }
  
  /**
   * Get JSON schema for character analysis
   * Defines all nullable fields to allow AI to return null for unclear features
   * Schema adapts based on character type to ensure correct enum validation
   */
  private getCharacterAnalysisSchema(characterType: 'person' | 'animal' | 'imaginary'): any {
    // Select appropriate distinctive features enum based on character type
    const distinctiveFeaturesEnum = characterType === 'animal' 
      ? [...PET_DISTINCTIVE_FEATURES]
      : characterType === 'person'
      ? [...CHILD_DISTINCTIVE_FEATURES, ...HUMAN_DISTINCTIVE_FEATURES] // Combine child and human for people
      : [...CHILD_DISTINCTIVE_FEATURES, ...HUMAN_DISTINCTIVE_FEATURES, ...PET_DISTINCTIVE_FEATURES]; // All for imaginary
    
    return {
      type: 'object' as const,
      properties: {
        detailedDescription: { 
          type: 'string',
          description: 'A flowing narrative description of the character\'s appearance (2-3 sentences)'
        },
        appearanceTraits: {
          type: ['object', 'null'],
          description: 'Structured appearance characteristics (null if photo too unclear)',
          properties: {
            // Human fields
            hairColor: { 
              type: ['string', 'null'], 
              enum: toEnumWithNull(HUMAN_HAIR_COLORS),
              description: 'Hair color (null if not visible)'
            },
            hairStyle: { 
              type: ['string', 'null'], 
              enum: toEnumWithNull(HUMAN_HAIR_STYLES),
              description: 'Hair style (null if not visible)'
            },
            hairLength: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(HUMAN_HAIR_LENGTHS),
              description: 'Hair length (null if not determinable)'
            },
            eyeColor: { 
              type: ['string', 'null'], 
              enum: toEnumWithNull(EYE_COLORS),
              description: 'Eye color (null if not visible)'
            },
            skinTone: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(SKIN_TONES),
              description: 'Skin tone (null if unclear)'
            },
            faceShape: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(FACE_SHAPES),
              description: 'Face shape (null if unclear)'
            },
            bodyType: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(BUILDS),
              description: 'Body type (null if not determinable)'
            },
            height: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(HEIGHTS),
              description: 'Relative height (null if not determinable)'
            },
            age: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(CHARACTER_AGE_GROUPS),
              description: 'Age group (null if unclear)'
            },
            // Animal fields
            species: { 
              type: ['string', 'null'],
              description: 'Animal species (null if not recognizable)'
            },
            breed: { 
              type: ['string', 'null'],
              description: 'Animal breed (null if not recognizable)'
            },
            furColor: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(FUR_COLORS),
              description: 'Fur or feather primary color (null if not visible)'
            },
            furPattern: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(FUR_PATTERNS),
              description: 'Fur pattern (null if not visible)'
            },
            furLength: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(FUR_LENGTHS),
              description: 'Fur length (null if not visible)'
            },
            size: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(PET_SIZES),
              description: 'Relative size (null if unclear)'
            },
            eyeColorAnimal: { 
              type: ['string', 'null'],
              enum: toEnumWithNull(PET_EYE_COLORS),
              description: 'Eye color for animals (null if not visible)'
            },
            // Fantasy fields
            fantasyType: { 
              type: ['string', 'null'],
              description: 'Fantasy creature type (null if not applicable)'
            },
            magicalFeatures: { 
              type: ['array', 'null'], 
              items: { type: 'string' },
              maxItems: 10,
              description: 'Magical features - max 10 items (null if none visible)'
            }
          }
        },
        clothing: {
          type: ['object', 'null'],
          description: 'Clothing and accessories (null if not visible)',
          properties: {
            style: { 
              type: ['string', 'null'],
              enum: [...CLOTHING_STYLES, 'fantasy', null],
              description: 'Clothing style (null if unclear)'
            },
            colors: { 
              type: ['array', 'null'], 
              items: { 
                type: 'string',
                enum: [...CLOTHING_COLORS]
              },
              maxItems: 3,
              description: 'Clothing colors - max 3 (null if not visible)'
            },
            distinctiveItems: { 
              type: ['array', 'null'], 
              items: { 
                type: 'string',
                enum: [...CLOTHING_ITEMS]
              },
              maxItems: 5,
              description: 'Distinctive clothing items - max 5 (null if none visible)'
            },
            accessories: { 
              type: ['array', 'null'], 
              items: { 
                type: 'string',
                enum: [...ACCESSORIES]
              },
              maxItems: 5,
              description: 'Accessories - max 5 (null if none visible)'
            }
          }
        },
        distinctiveFeatures: {
          type: ['array', 'null'],
          items: { 
            type: 'string',
            enum: distinctiveFeaturesEnum // Use character-type-specific enum
          },
          maxItems: 5,
          description: 'Notable marks, expressions, or characteristics - max 5 items (null if none)'
        }
      },
      required: ['detailedDescription'] // Only description is required
    };
  }
  
  /**
   * Download image from URL and return as buffer
   * Uses native fetch (Node 18+)
   */
  private async downloadImage(url: string): Promise<Buffer> {
    try {
      logger.debug({ url }, 'Downloading image for analysis');
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error({ error, url }, 'Failed to download image');
      throw new Error(`Failed to download image from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
