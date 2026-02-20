/**
 * Image Prompt Engineering
 * Functions for building prompts for image generation with character consistency
 */

import { stripAudioTags } from '../../utils/audioTags';
import { logger } from '../../utils/logger';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
import type { StoryEnvironment } from '../../ai/types';
import { getImageStylePrefix } from './styles';

export interface CharacterReference {
  name: string;
  referencePhotos?: Array<{ url: string; purpose?: string }>;
  appearanceTraits?: any;
  appearance?: string; // LLM-generated description
  description?: string;
}

/**
 * Build complete image prompt for a scene.
 *
 * New structured format (Google Asset Graph pattern):
 *   Image labels + SETTING + CAMERA (with Image N refs) + CHARACTERS (with Image N refs) + LIGHTING
 *   STYLE, FORMAT, and QUALITY are in systemInstruction (not repeated here).
 *
 * Supports two character types:
 *   - Real-world characters (people, animals): text description from Gemini Vision
 *   - Imaginary creatures (child's drawings): reference drawing attached as image
 */
export function buildSceneImagePrompt(params: {
  sceneVisual?: SceneVisual; // New structured visual (preferred)
  visualPrompt?: string; // Deprecated fallback for old stories
  ageGroup: string;
  style: string;
  // Imaginary creatures with reference drawings attached as images
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean }>;
  // Real-world characters (people, animals) with text descriptions from Gemini Vision
  realWorldCharacters?: Array<{ name: string; description: string }>;
  hasReferences?: boolean;
  // Google Asset Graph pattern: maps normalized character name -> Image index
  imageIndexMap?: Map<string, number>;
  // Current scene's environment (moved from system instruction to user prompt)
  currentEnvironment?: StoryEnvironment;
  // Scene-specific outfit overrides from text generation
  characterOutfits?: Record<string, string>;
  // Legacy params kept for non-reference (Imagen 3) path
  characters?: CharacterReference[];
  negativePrompt?: string;
}): string {
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup);
  const safetyAdditions = getSafetyPromptAdditions(params.ageGroup);

  // --- New structured path (sceneVisual available) ---
  if (params.sceneVisual) {
    return buildStructuredPrompt({
      sceneVisual: params.sceneVisual,
      stylePrefix,
      safetyAdditions,
      referenceCharacterNames: params.referenceCharacterNames,
      realWorldCharacters: params.realWorldCharacters,
      hasReferences: params.hasReferences,
      imageIndexMap: params.imageIndexMap,
      currentEnvironment: params.currentEnvironment,
      characterOutfits: params.characterOutfits,
    });
  }

  // --- Legacy fallback (old stories with string visualPrompt) ---
  const cleanVisualPrompt = stripAudioTags(params.visualPrompt || '');

  if (params.hasReferences) {
    const characterLines = buildCharacterSection(
      params.realWorldCharacters,
      params.referenceCharacterNames,
      true,
      params.imageIndexMap,
    );
    const charSection = characterLines ? `\n\n${characterLines}` : '';
    return `${stylePrefix}, ${cleanVisualPrompt}${charSection}, ${safetyAdditions}. Do not include any text or letters in the image.`;
  }

  // Non-reference legacy path (Imagen 3)
  let characterPart = '';
  if (params.characters && params.characters.length > 0) {
    const characterDescriptions = buildCharacterDescriptions(params.characters);
    if (characterDescriptions) characterPart = `, ${characterDescriptions}`;
  }
  const noTextPrefix = 'CRITICAL RULE: ABSOLUTELY NO TEXT OR LETTERS anywhere on the image. ';
  const noTextSuffix = '. STRICTLY FORBIDDEN: No text, no letters, no words, no numbers, no symbols, no writing, no typography, no captions, no subtitles, no labels, no signs, no banners, no speech bubbles, no thought bubbles, no text on screens, no text on objects, no text on clothing, no text on buildings, no text on vehicles, no text anywhere. Pure visual storytelling ONLY';
  const negativeGuidance = params.negativePrompt ? `, avoid: ${params.negativePrompt}` : '';
  const aggressiveTextBlocking = ', NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO TYPOGRAPHY, NO CAPTIONS, NO LABELS, NO SIGNS';

  const fullPrompt = `${noTextPrefix}${stylePrefix}${characterPart}, ${cleanVisualPrompt}, ${safetyAdditions}${noTextSuffix}${aggressiveTextBlocking}${negativeGuidance}`;
  return optimizePromptLength(fullPrompt, 2000);
}

/**
 * Build new structured prompt from sceneVisual fields.
 * Google Asset Graph pattern: scene-specific SETTING, CAMERA, CHARACTERS, LIGHTING.
 * Also includes per-scene CHARACTER ROSTER and ENVIRONMENT (moved from system instruction
 * to reduce token overhead — each API call is independent, no multi-turn context).
 */
function buildStructuredPrompt(params: {
  sceneVisual: SceneVisual;
  stylePrefix: string;
  safetyAdditions: string;
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean }>;
  realWorldCharacters?: Array<{ name: string; description: string }>;
  hasReferences?: boolean;
  imageIndexMap?: Map<string, number>;
  currentEnvironment?: StoryEnvironment;
  characterOutfits?: Record<string, string>;
}): string {
  const { sceneVisual } = params;

  const sections: string[] = [];

  // SETTING (scene-specific)
  if (sceneVisual.setting) {
    sections.push(`- Scene: ${sceneVisual.setting}`);
  }

  // CHARACTERS — with Image N back-references and inline descriptions
  const characterLines = buildCharacterSection(
    params.realWorldCharacters,
    params.referenceCharacterNames,
    params.hasReferences,
    params.imageIndexMap,
    params.characterOutfits,
  );
  if (characterLines) {
    sections.push(characterLines);
  }

  // CAMERA / COMPOSITION (may contain character positions with Image N refs)
  if (sceneVisual.cameraComposition) {
    // Flatten structured cameraComposition to text string
    const { text: compositionText } = flattenCameraComposition(sceneVisual.cameraComposition);
    let composition = compositionText;
    if (params.imageIndexMap) {
      for (const [charName, imgIdx] of params.imageIndexMap) {
        // Add (Image N) after character name if not already present
        const namePattern = new RegExp(`(${escapeRegExp(charName)})(?!\\s*\\(Image)`, 'gi');
        composition = composition.replace(namePattern, `$1 (Image ${imgIdx})`);
      }
    }
    sections.push(`- Composition: ${composition}`);
  }

  // LIGHTING (scene-specific)
  if (sceneVisual.lighting) {
    sections.push(`- Lighting: ${sceneVisual.lighting}`);
  }

  return sections.join('\n');
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build unified CHARACTERS section with per-character instructions.
 * Uses Google's "Image N" back-references for characters with visual references.
 * Real-world characters get their description inline (no longer in system instruction).
 * If characterOutfits are provided, appends scene-specific outfit to the description.
 */
function buildCharacterSection(
  realWorldCharacters?: Array<{ name: string; description: string }>,
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean }>,
  _hasReferences?: boolean,
  imageIndexMap?: Map<string, number>,
  characterOutfits?: Record<string, string>,
): string {
  const lines: string[] = [];

  // Imaginary creatures: short back-reference with Image N
  if (referenceCharacterNames) {
    for (const entry of referenceCharacterNames) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const imgIdx = imageIndexMap?.get(name);
      const outfitOverride = characterOutfits?.[name];
      const outfitSuffix = outfitOverride ? `. Outfit in this scene: ${outfitOverride}` : '';
      if (imgIdx) {
        const sheetType = (typeof entry !== 'string' && entry.isTurnaround) ? 'character design from the sheet' : 'reference photo';
        lines.push(`- ${name} (Image ${imgIdx}): match the ${sheetType}${outfitSuffix}`);
      } else {
        lines.push(`- ${name}: match the attached reference image${outfitSuffix}`);
      }
    }
  }

  // Real-world characters: inline description (moved from system instruction)
  if (realWorldCharacters) {
    for (const char of realWorldCharacters) {
      const imgIdx = imageIndexMap?.get(char.name);
      const outfitOverride = characterOutfits?.[char.name];
      const desc = outfitOverride
        ? `${char.description}. Outfit in this scene: ${outfitOverride}`
        : char.description;
      if (imgIdx) {
        lines.push(`- ${char.name} (Image ${imgIdx}): ${desc}`);
      } else {
        lines.push(`- ${char.name}: ${desc}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build character descriptions for inclusion in prompt
 */
function buildCharacterDescriptions(characters?: CharacterReference[]): string {
  if (!characters || characters.length === 0) return '';
  
  const descriptions = characters.map(char => {
    // Priority: appearance (LLM-generated) > description > appearanceTraits
    if (char.appearance) {
      return char.appearance;
    }
    
    if (char.description) {
      return `${char.name}: ${char.description}`;
    }
    
    // Build from appearanceTraits if available
    if (char.appearanceTraits) {
      const traits = char.appearanceTraits;
      const parts: string[] = [char.name];
      
      if (traits.hairColor) parts.push(`${traits.hairColor} hair`);
      if (traits.hairStyle) parts.push(`${traits.hairStyle} hairstyle`);
      if (traits.eyeColor) parts.push(`${traits.eyeColor} eyes`);
      if (traits.skinTone) parts.push(`${traits.skinTone} skin`);
      if (traits.height) parts.push(traits.height);
      if (traits.build) parts.push(traits.build);
      if (traits.clothingStyle) parts.push(traits.clothingStyle); // NEW: Add clothing style
      
      return parts.join(', ');
    }
    
    return char.name;
  });
  
  return descriptions.length > 0 ? `Characters: ${descriptions.join('; ')}` : '';
}

/**
 * Build negative prompt for image generation
 * Excludes inappropriate content based on age group
 */
export function buildNegativePrompt(ageGroup: string): string {
  const baseNegative = [
    'scary', 'horror', 'violent', 'gore', 'blood',
    'sexual', 'nude', 'inappropriate',
    // ULTRA-AGGRESSIVE text blocking
    'text', 'letters', 'words', 'writing', 'typography', 'font',
    'watermark', 'logo', 'signature', 'label', 'sign', 'banner',
    'speech bubbles', 'dialogue bubbles', 'text bubbles', 'captions',
    'subtitles', 'written text', 'words on image', 'text on screen',
    'text on objects', 'text on clothing', 'text on buildings',
    'numbers', 'digits', 'symbols on image', 'written symbols',
    'alphabet', 'characters', 'glyphs', 'inscriptions',
    'photorealistic', 'photo', 'photograph', 'realistic photo',
    'real person', 'camera', 'photography', 'stock photo', 'selfie',
    'realistic photograph', 'photographic', 'real life photo',
    'deformed', 'ugly', 'blurry', 'low quality',
    'extra limbs', 'distorted face', 'bad anatomy',
  ];
  
  // Add age-specific exclusions
  if (ageGroup === '0-1' || ageGroup === '1y' || ageGroup === '2-3') {
    baseNegative.push('darkness', 'shadows', 'monsters', 'scary faces');
  }
  
  return baseNegative.join(', ');
}


/**
 * Get safety prompt additions based on age group
 */
function getSafetyPromptAdditions(ageGroup: string): string {
  const baseSafety = 'safe for children, friendly, positive, age-appropriate';
  
  if (ageGroup === '0-1' || ageGroup === '1y') {
    return `${baseSafety}, no scary elements, pure comfort and safety`;
  } else if (ageGroup === '2-3') {
    return `${baseSafety}, no frightening imagery, gentle and reassuring`;
  } else if (ageGroup === '4-5' || ageGroup === '6-8') {
    return `${baseSafety}, friendly atmosphere, no scary or threatening elements`;
  }
  
  return baseSafety;
}

/**
 * Build prompt for generating a character portrait
 * Used for creating reference images when user hasn't provided any
 */
export function buildCharacterPortraitPrompt(params: {
  characterName: string;
  description: string;
  style: string;
  ageGroup: string;
  characterType?: string;
  negativePrompt?: string; // Negative prompt to include as text
}): string {
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup);
  const safetyAdditions = getSafetyPromptAdditions(params.ageGroup);
  
  // ULTRA-STRONG no text instruction for portraits
  const noTextPrefixInstruction = 'CRITICAL: ABSOLUTELY NO TEXT OR LETTERS. ';
  const noTextSuffixInstruction = ', STRICTLY NO text, NO letters, NO words, NO writing, NO speech bubbles, NO captions, NO labels, NO text on clothing';
  
  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeGuidance = params.negativePrompt 
    ? `, avoid: ${params.negativePrompt}` 
    : '';
  
  // Aggressive text blocking
  const aggressiveTextBlocking = ', NO TEXT, NO LETTERS, NO WORDS ANYWHERE';
  
  return `${noTextPrefixInstruction}${stylePrefix}, character portrait, close-up view, ${params.description}, clear details, front-facing${noTextSuffixInstruction}, ${safetyAdditions}${aggressiveTextBlocking}${negativeGuidance}`;
}

// buildReferenceInstruction() removed — per-character instructions are now part of buildCharacterSection()

/**
 * Build a system instruction that contains the static parts of the image
 * generation context (style, character descriptions, quality rules).
 *
 * This is set once per story and reused across all scenes via the
 * `systemInstruction` field in GenerateContentConfig, keeping the per-scene
 * user prompt lean (only dynamic scene-specific content).
 *
 * The model treats system instructions as persistent context with higher
 * priority than user messages, and Google may cache repeated system
 * instructions internally for reduced latency / cost.
 */
export function buildImageSystemInstruction(params: {
  style: string;
  ageGroup: string;
  hasReferences?: boolean;
}): string {
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup);
  const safetyAdditions = getSafetyPromptAdditions(params.ageGroup);

  const sections: string[] = [];

  // Role
  sections.push('You are a professional children\'s book illustrator.');

  // Art style
  sections.push(`ART STYLE: ${stylePrefix}`);

  // Format rules
  sections.push(
    'FORMAT: Single full-bleed illustration filling the frame edge-to-edge. No text, no speech bubbles.',
  );

  // Reference image rules (only when turnaround sheets are attached)
  if (params.hasReferences) {
    sections.push(
      'REFERENCES: Keep the exact proportions, silhouette, colors, and distinctive features from the provided character sheets. ' +
      'Re-draw them in the scene\'s art style (the sheets are for design reference only).',
    );
  }

  // Clothing adaptation rule
  sections.push(
    'CLOTHING: Scene-appropriate outfit while keeping each character recognizable.',
  );

  // Tone / safety
  sections.push(`TONE: ${safetyAdditions}.`);

  return sections.join('\n\n');
}

/**
 * Optimize prompt length to stay within recommended limits
 * Truncates at word boundary if prompt exceeds maxLength
 */
function optimizePromptLength(prompt: string, maxLength: number = 2000): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }
  
  logger.warn({
    originalLength: prompt.length,
    maxLength,
    excess: prompt.length - maxLength
  }, 'Prompt exceeds recommended length, truncating');
  
  // Truncate at word boundary
  const truncated = prompt.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 
    ? truncated.substring(0, lastSpace) + '...' 
    : truncated + '...';
}

/**
 * Extract scene characters from scene text
 * Simple implementation that looks for character names in the text
 */
export function extractSceneCharacters(
  sceneText: string,
  allCharacters: CharacterReference[]
): CharacterReference[] {
  const sceneLower = sceneText.toLowerCase();
  
  return allCharacters.filter(char => {
    const nameLower = char.name.toLowerCase();
    return sceneLower.includes(nameLower);
  });
}
