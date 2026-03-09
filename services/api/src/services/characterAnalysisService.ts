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

import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { GeminiTextProvider } from '../providers/text/gemini/GeminiTextProvider';
import { logger } from '../utils/logger';
import { config } from '../config';
import type { CharacterType } from '@wondertales/shared';
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
} from '@wondertales/shared';

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
  characterType: CharacterType;
  language?: string; // User's preferred language for description (e.g., 'uk', 'en', 'ru')
  existingTraits?: Record<string, any>; // Optional: existing appearance traits to refine
}

export interface CharacterAnalysisOptions {
  onUsage?: (usage: UsageMetadata) => void;
}

/**
 * Structured result from character analysis
 */
export interface CharacterAnalysisResult {
  // Suggested character name (for instant mode)
  suggestedName: string;
  
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
    // Imaginary creature structured fields
    bodyShape?: string | null;
    bodyTexture?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    colorPattern?: string | null;
    eyeCount?: number | null;
    earCount?: number | null;
    armCount?: number | null;
    legCount?: number | null;
    wingCount?: number | null;
    tailCount?: number | null;
    hornCount?: number | null;
    headCount?: number | null;
    wingType?: string | null;
    tailShape?: string | null;
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
  async analyzeCharacter(request: AnalyzeCharacterRequest, options?: CharacterAnalysisOptions): Promise<CharacterAnalysisResult> {
    logger.info({ 
      photoCount: request.photos.length, 
      characterType: request.characterType 
    }, 'Starting character analysis with Gemini Vision');
    
    // 1. Download photos from URLs (already preprocessed at upload time by assetStorageService)
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
      onUsage: options?.onUsage,
      operation: 'character_analysis',
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
    
    // Type-specific description guidance (used in the prompt for DETAILED_DESCRIPTION section)
    const descriptionGuidance = characterType === 'person' 
      ? `A flowing, narrative description of the character's appearance (2-3 sentences) in ${languageName}. Describe from top to bottom: hair/head first, then face features (eyes, nose, mouth), skin details (freckles, moles, birthmarks, dimples), body build, and clothing. Mention specific jewelry, hair accessories, and glasses if visible.`
      : characterType === 'animal'
      ? `A flowing, narrative description of the animal's appearance (2-3 sentences) in ${languageName}. Start with species/breed, then describe fur/feathers (color, pattern, length, texture), body shape and size, distinctive markings (spots, patches, stripes with locations), and any accessories (collar, bandana).`
      : `A detailed, comprehensive description of the imaginary creature's appearance (3-5 sentences) in ${languageName}. Start with overall shape and size. Then describe EVERY body part with EXACT COUNTS (e.g. "three large blue eyes", "four small wings", "two curled horns"). Describe body texture, all colors and patterns, limbs and extremities. ANTHROPOMORPHIC LIMB RULE: AI illustration renders creatures in an anthropomorphic style — the front/upper pair of appendages becomes arms, the rest stay as legs. Describe limbs accordingly: 4 appendages = "two arms and two legs" (NOT "four legs"); 6 appendages = "two arms and four legs" (NOT "six legs"); 8 appendages = "two arms and six legs" (NOT "eight legs"). Exception: if ALL appendages are clearly legs (all in shoes/boots, creature walks on all fours like an animal, no grasping limbs), describe them all as legs and note "quadrupedal" or "multi-legged" explicitly. Mention any drawn accessories or magical elements.`;

    // Fully type-specific visual analysis guidance — each type gets ONLY its relevant sections
    const traitGuidance = characterType === 'person' ? `
  HEAD & FACE:
   - Hair: color (${HUMAN_HAIR_COLORS.join('/')}), style (${HUMAN_HAIR_STYLES.join('/')}), length (${HUMAN_HAIR_LENGTHS.join('/')}) - return null if not visible
   - Hair texture: straight/wavy/curly/coily/frizzy - note if visible
   - Bangs/fringe: present or not, style (straight-cut/side-swept/curtain)
   - Eyes: color (${EYE_COLORS.join('/')}), shape (round/almond/narrow/wide/hooded), size (small/normal/large), eyelash length (short/normal/long) - return null if not visible
   - Eyebrows: shape (arched/straight/thick/thin/bushy), color - return null if not visible
   - Nose: shape (small/button/long/wide/upturned/pointed/flat/aquiline) - return null if not visible
   - Mouth & lips: size (thin/medium/full), lip color, smile/expression - return null if not visible
   - Ears: size (small/normal/large), protruding or flat against head - return null if not visible
   - Chin & jaw: shape (pointed/round/square/soft) - return null if not visible
   - Face shape: (${FACE_SHAPES.join('/')}) - return null if unclear
   - Skin: tone (${SKIN_TONES.join('/')}), freckles (location: cheeks/nose/all-over), moles/birthmarks (exact location!), dimples (cheek/chin), rosy cheeks, wrinkles - return null if not visible

  BODY:
   - Build: (${BUILDS.join('/')}) - return null if unclear
   - Height: (${HEIGHTS.join('/')}) - return null if unclear
   - Age group: (${CHARACTER_AGE_GROUPS.join('/')}) - return null if unclear

  HAIR ACCESSORIES & HEADWEAR:
   - Headband, hair clips, bows, ribbons, tiara/crown, scrunchie
   - Hat, cap, beanie, beret, hood
   - Return null if none visible

  JEWELRY & ACCESSORIES:
   - Earrings (type: studs/hoops/dangly), necklace, pendant, bracelet, ring, watch
   - Glasses (type: round/rectangular/cat-eye/no-frame/sunglasses)
   - Return null if none visible

  CLOTHING (if visible):
   - Overall style: (${CLOTHING_STYLES.join('/')}/fantasy) - return null if unclear
   - Colors: choose from (${CLOTHING_COLORS.join('/')}) - return null or empty array if not visible
   - Distinctive items: choose from (${CLOTHING_ITEMS.join('/')}) - return null or empty array if none visible
   - Accessories: choose from (${ACCESSORIES.join('/')}) - return null or empty array if none visible
   - Pattern on clothing: solid/striped/polka-dot/plaid/floral/printed - note if visible

  DISTINCTIVE FEATURES (max 5):
   - Choose from: (${HUMAN_DISTINCTIVE_FEATURES.join('/')})
   - For children also consider: (${CHILD_DISTINCTIVE_FEATURES.join('/')})
   - Return null or empty array if none visible
   - Select only the MOST distinctive and recognizable features` :

    characterType === 'animal' ? `
  HEAD:
   - Eyes: color (${PET_EYE_COLORS.join('/')}), shape (round/almond/narrow), size (small/normal/large), expression - return null if not visible
   - Ears: shape (floppy/pointy/short/folded/large/round/tufted), position (upright/sideways/back), size relative to head - return null if not visible
   - Nose/snout: color (black/pink/brown/spotted), shape (short/long/flat/pointed), size - return null if not visible
   - Mouth/muzzle: shape, visible teeth, tongue - return null if not visible
   - Whiskers: length (short/medium/long), color, prominent or subtle - return null if not visible

  BODY:
   - Species and breed (if recognizable) - return null if unclear
   - Size: (${PET_SIZES.join('/')}) - return null if unclear
   - Body shape: stocky/slender/muscular/round/long/compact
   - Fur/feathers: primary color (${FUR_COLORS.join('/')}), secondary color if any
   - Fur pattern: (${FUR_PATTERNS.join('/')}) - return null if not visible
   - Fur length: (${FUR_LENGTHS.join('/')}) - return null if not visible
   - Fur texture: smooth/wiry/fluffy/silky/rough/curly/double-coat

  LEGS & PAWS:
   - Paw color: same as body or different (white paws, dark paws)
   - Paw size: relative to body
   - Claws: visible or not, color
   - Leg length: short/normal/long relative to body

  TAIL:
   - Length: long/medium/short/no tail/docked
   - Shape: bushy/thin/curled/straight/plumed/bobbed/ringed
   - Color: same as body or different

  MARKINGS & PATTERNS (location is critical!):
   - Spots: location (face/chest/belly/back/paws/all-over), size (small/large)
   - Stripes: location, direction, width
   - Patches: location, color contrast
   - Specific markings: white chest, white belly, white paws/socks, spot over eye, mask pattern, tabby pattern, tuxedo pattern, blaze on forehead, ear tips color
   - Return null if no distinctive markings

  ACCESSORIES (if any):
   - Collar: color, type (plain/studded/bell), tag
   - Bow, bandana, scarf
   - Return null if none visible

  DISTINCTIVE FEATURES (max 5):
   - Choose from: (${PET_DISTINCTIVE_FEATURES.join('/')})
   - Return null or empty array if none visible
   - Select only the MOST distinctive and recognizable features` : `

  CRITICAL - EXACT BODY PART COUNTS (imaginary creatures may have unusual anatomy):
   - Number of eyes: (0? 1? 2? 3? many? where positioned on body/head/stalks?)
     IMPORTANT: Round structures on stalks WITH PUPILS or circles inside = EYES ON STALKS (not ears/antennae!)
     Children often draw eyes on stalks like a snail. Count stalk-eyes.
     WARNING: Do NOT count the nose as an eye! A large teardrop/triangle/blob shape centered on the face above the mouth is a NOSE, even if it looks dark or has dots inside (those are nostrils). Only count clearly separate round shapes with a single distinct pupil as eyes.
   - Has nose: (yes/no?) — a teardrop, triangle, or blob centered above the mouth = nose. Two dots inside = nostrils.
   - Number of ears: (0? 2? 4? shape?) - Only count if clearly ear-shaped WITHOUT pupils inside
   - Number of arms/hands: (0? 2? 4? tentacles instead?) — for creatures with 4+ similar appendages, count the FRONT/UPPER pair as arms
   - Number of legs/feet: (0? 2? 4? 6? 8? none?) — count the remaining appendages as legs. Exception: if ALL appendages are clearly legs (all in shoes, quadrupedal stance), count all as legs
   - Number of wings: (0? 2? 4? type?)
   - Number of tails: (0? 1? 2? many?)
   - Number of heads: (1? 2? 3?)
   - Number of fingers per hand: (if applicable and visible)
   - Number of horns: (0? 1? 2? many? shape?)
   - Number of antennae: (0? 1? 2? what's on tips?) - Only if tips have balls/stars/lights, NOT pupils
   - DISAMBIGUATION: stalk with pupil/circle = EYE; stalk with ball/star/light = ANTENNA; flat flap without pupil = EAR
   - IMPORTANT: Count carefully and report EXACT numbers!

  OVERALL BODY:
   - Body shape: round/oval/square/triangular/blob/elongated/star-shaped/amorphous/serpentine/humanoid
   - Body segmentation: single uniform shape, or divided into distinct colored zones? Describe each zone top-to-bottom (e.g., "blue upper torso, yellow midsection, green lower body")
   - Size relative to a child (tiny/small/child-sized/large/huge)
   - Proportions: head-to-body ratio (big head? tiny body? normal?), limb proportions

  HEAD & FACE (IMPORTANT — identify nose BEFORE eyes to avoid misclassification):
   - Head shape: round/square/triangular/elongated/star/heart/irregular
   - Nose FIRST: Look at the large shape centered on the face directly above the mouth.
     * If it is a teardrop/triangle/oval/blob shape positioned between the mouth and the top of the head → it is a NOSE (children often draw oversized, colorful noses)
     * Two small dots or holes inside it = nostrils, confirming it is a nose
     * If the creature already has eyes on stalks or elsewhere, a large face-centered shape is almost certainly a NOSE, not another eye
     * Return null only if no nose-like shape is visible at all
   - Eyes: ONLY features that are clearly eyes (round with a distinct single pupil/iris).
     * Include eyes on stalks (stalks with pupils = eyes, not ears)
     * Do NOT count the nose as an eye. If you already identified a shape as a nose above, do not also list it as an eye.
     * Eyes on the face itself: only if there are separate round shapes with clear pupils APART from the nose
   - Mouth: size (tiny/normal/wide), shape, visible teeth (type: sharp/flat/fangs/none), tongue (visible? color? forked?)
   - Ears: shape (pointy/round/antenna-like/leaf-shaped/fin-shaped/absent), size (tiny/normal/huge), position on head
   - Horns: type (straight/curved/spiral/branching/antler-like), size, color, position
   - Antennae: shape (straight/curled/segmented), length, what's on tips (balls/stars/lights/hearts?)
   - Crown/crest/mane/fin/tuft on head: type, color, size

  BODY SURFACE & TEXTURE:
   - Texture: furry/scaly/smooth/spiky/slimy/rocky/crystalline/feathered/woolly/metallic/gelatinous/bark-like
   - Fur/hair: length (short/medium/long/shaggy), color, fluffiness, direction
   - Scales: size (tiny/medium/large), pattern (overlapping/mosaic)
   - Surface details: bumps, ridges, plates, segments

  COLORS & PATTERNS:
   - Primary color (main body color)
   - Secondary color (accents, belly, limbs)
   - Tertiary color (small details)
   - Gradient: does color fade from one to another? where?
   - Pattern type: solid/spotted/striped/swirled/checkered/starry/geometric/rainbow
   - Spots: color, size, location
   - Stripes: color, width, direction (horizontal/vertical/diagonal)
   - Glow/luminescence: which parts glow? what color?
   - Sparkles/shimmer/transparency: where?
   - Body markings: belly button, dot on belly, mark on chest, navel, circle/symbol on body — note exact location

  LIMBS & EXTREMITIES:
   - Arms/tentacles: shape (thin/thick/tapering), what's at the end (hands/claws/suction-cups/paws/pincers), color
   - Legs: shape (thin/thick/stumpy/digitigrade), hoof/paw/claw type, color — count legs carefully even when overlapping or close together in the drawing
   - Wings: type (bat-like/bird-like/butterfly/dragonfly/fairy/insect/membrane), size relative to body, color, pattern on wings, transparent or opaque
   - Tail: shape (bushy/thin/arrow-tip/heart-tip/star-tip/flame-tip/curled/spiked), length, color, features at tip

  DRAWN ACCESSORIES & MAGICAL ELEMENTS:
   - Accessories drawn on creature: hat, bow, crown, scarf, necklace, glasses, cape, collar, belt
   - Held items: wand, star, flower, book, orb
   - Special markings: heart on belly, star on forehead, symbol on chest, runes
   - Magical elements: glowing parts, sparkles, aura, floating elements, fire, ice, lightning, bubbles
   - Return null if none visible`;

    return `LEGITIMATE USE CASE: This analysis is for creating personalized children's storybook illustrations. The photos are uploaded by parents/guardians for their own children to appear as characters in educational stories.

Analyze the provided photo(s) and create a detailed character description for children's book illustration.

Character Type: ${characterTypeLabel}
Language: Write the DETAILED_DESCRIPTION in ${languageName}

IMPORTANT: Return null for ANY field that you cannot confidently determine from the photos. If a photo is unclear, blurry, or doesn't show certain features - return null for those fields. Only provide values you can clearly see and identify.

Please provide a comprehensive JSON response with the following structure:

1. SUGGESTED_NAME: A creative, fictional name for this character (1-3 words).
   - IMPORTANT: The name MUST be in ${languageName} language
   - For people: Invent a name that fits their age and personality
     Examples for Ukrainian: "Софійка", "Максимко", "Олівія", "Лео"
     Examples for English: "Sophie", "Max", "Olivia", "Leo"
   - For animals: Use breed-inspired or characteristic-based names
     Examples for Ukrainian: "Рижик", "Барсик", "Снігурка"
     Examples for English: "Ginger", "Buddy", "Snowball"
   - For imaginary creatures: Create a fantasy name matching their appearance
     Examples for Ukrainian: "Блакитко", "Зірочка", "Фіолетик"
     Examples for English: "Bluey", "Starlight", "Violet"
   - Make it sound natural, like a real storybook character name
   - Avoid generic descriptive labels like "Girl with Hair" or "Blue Dragon"

2. DETAILED_DESCRIPTION: ${descriptionGuidance}
   This should be based ONLY on what is visible in the photos. If photos are very unclear, describe what you CAN see.

3. VISUAL ANALYSIS (use null for any unclear/invisible features):
${traitGuidance}

Important guidelines:
- NO DOUBLE-COUNTING: Each visible element in the image must be identified as ONE thing only. Never describe the same visual feature under two different categories. A single teardrop/triangle/blob shape on the face is EITHER a nose OR an eye — NEVER both. Decision rule: if it is centered above the mouth and the creature already has eyes elsewhere (e.g., on stalks), it is a NOSE.
- SELF-CHECK: Before finalizing, count how many distinct physical features you described vs how many are actually drawn. If your total described features exceeds the actual count, you are double-counting. Remove duplicates, keeping the most anatomically logical interpretation (position on face matters: above mouth = nose, at eye-level = eye).
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
        suggestedName: {
          type: 'string',
          description: 'A short descriptive name for the character (1-3 words)'
        },
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
            },
            // Imaginary creature structured fields
            bodyShape: {
              type: ['string', 'null'],
              description: 'Overall body shape: round/oval/square/triangular/blob/elongated/star-shaped/amorphous/serpentine/humanoid (null if unclear)'
            },
            bodyTexture: {
              type: ['string', 'null'],
              description: 'Surface texture: furry/scaly/smooth/spiky/slimy/rocky/crystalline/feathered/woolly/metallic/gelatinous (null if unclear)'
            },
            primaryColor: {
              type: ['string', 'null'],
              description: 'Main body color (null if unclear)'
            },
            secondaryColor: {
              type: ['string', 'null'],
              description: 'Secondary/accent color (null if not present or unclear)'
            },
            colorPattern: {
              type: ['string', 'null'],
              description: 'Color pattern: solid/spotted/striped/swirled/checkered/starry/geometric/gradient/rainbow (null if not applicable)'
            },
            eyeCount: {
              type: ['number', 'null'],
              description: 'Exact number of eyes (null if unclear)'
            },
            earCount: {
              type: ['number', 'null'],
              description: 'Exact number of ears (null if unclear or absent)'
            },
            armCount: {
              type: ['number', 'null'],
              description: 'Exact number of arms/tentacles (null if unclear or absent)'
            },
            legCount: {
              type: ['number', 'null'],
              description: 'Exact number of legs (null if unclear or absent)'
            },
            wingCount: {
              type: ['number', 'null'],
              description: 'Exact number of wings (null if absent)'
            },
            tailCount: {
              type: ['number', 'null'],
              description: 'Exact number of tails (null if absent)'
            },
            hornCount: {
              type: ['number', 'null'],
              description: 'Exact number of horns (null if absent)'
            },
            headCount: {
              type: ['number', 'null'],
              description: 'Exact number of heads (null if unclear, usually 1)'
            },
            wingType: {
              type: ['string', 'null'],
              description: 'Wing type: bat-like/bird-like/butterfly/dragonfly/fairy/insect/membrane (null if no wings)'
            },
            tailShape: {
              type: ['string', 'null'],
              description: 'Tail shape: bushy/thin/arrow-tip/heart-tip/star-tip/flame-tip/curled/spiked (null if no tail)'
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
      required: ['suggestedName', 'detailedDescription'] // Name and description are required
    };
  }
  
  /**
   * Download image from URL and return as buffer
   * Uses native fetch (Node 18+)
   */
  private async downloadImage(url: string): Promise<Buffer> {
    // Detect local asset URLs and read directly from storage
    const assetPrefix = '/api/v1/assets/';
    const assetIdx = url.indexOf(assetPrefix);
    if (assetIdx !== -1) {
      const pathWithQuery = url.substring(assetIdx + assetPrefix.length);
      const storagePath = pathWithQuery.split('?')[0];
      logger.debug({ storagePath }, 'Reading image directly from storage (local asset)');
      const { getAssetStorageService } = await import('./assetStorageService');
      return getAssetStorageService().getAssetByPath(storagePath);
    }

    // External URL — use HTTP fetch
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
