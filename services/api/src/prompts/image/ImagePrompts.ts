/**
 * Image Prompt Engineering
 * Functions for building prompts for image generation with character consistency
 */

import { stripAudioTags } from '../../utils/audioTags';
import { logger } from '../../utils/logger';

export interface CharacterReference {
  name: string;
  referencePhotos?: Array<{ url: string; purpose?: string }>;
  appearanceTraits?: any;
  appearance?: string; // LLM-generated description
  description?: string;
}

/**
 * Build complete image prompt for a scene
 * Includes style, characters, scene description, safety additions, and negative prompt
 */
export function buildSceneImagePrompt(params: {
  visualPrompt: string;
  ageGroup: string;
  style: string;
  characters?: CharacterReference[];
  hasReferences?: boolean; // Flag indicating reference photos are available
  negativePrompt?: string; // Negative prompt to include as text
  // NEW: Scene context for action/situation depiction
  sceneGoal?: string; // What happens in this scene
  sceneBeats?: string[]; // Key moments/actions
  sceneEmotion?: string; // Primary emotion
}): string {
  // Strip audio tags from visualPrompt for clean image generation
  const cleanVisualPrompt = stripAudioTags(params.visualPrompt);
  
  const stylePrefix = getStylePrefix(params.style, params.ageGroup);
  const safetyAdditions = getSafetyPromptAdditions(params.ageGroup);
  
  // Build character descriptions (ALWAYS include, even with references)
  let characterPart = '';
  if (params.characters && params.characters.length > 0) {
    const characterDescriptions = buildCharacterDescriptions(params.characters);
    if (characterDescriptions) {
      if (params.hasReferences) {
        // With references: traits are supplementary details to guide the stylization
        characterPart = `. Character appearance details: ${characterDescriptions}`;
      } else {
        // Without references: traits are primary description
        characterPart = `, ${characterDescriptions}`;
      }
    }
  }
  
  // Build scene action/situation context (CRITICAL for showing WHAT IS HAPPENING)
  let situationContext = '';
  if (params.sceneGoal) {
    situationContext += `. ACTION/SITUATION: ${params.sceneGoal}`;
  }
  if (params.sceneBeats && params.sceneBeats.length > 0) {
    situationContext += `. Key moments: ${params.sceneBeats.join(', ')}`;
  }
  if (params.sceneEmotion) {
    situationContext += `. Emotion: ${params.sceneEmotion}`;
  }
  
  // Build strong style enforcement for reference photos (CRITICAL)
  const referenceStyleEnforcement = params.hasReferences
    ? '. CRITICAL INSTRUCTION: Transform reference photos into CARTOON/ILLUSTRATION style matching the art style above. Create a STYLIZED CARTOON VERSION of the real person, NOT a photorealistic image, NOT a realistic photo. Apply the illustration art style specified: simplified cartoon features, illustrated faces, cartoon stylization. The reference photo shows WHO the character is (their appearance), but you must draw them as a CARTOON CHARACTER in the specified illustration style, NOT as a realistic photograph.'
    : '';
  
  // ULTRA-STRONG no text instruction (place at start for maximum weight)
  const noTextPrefixInstruction = 'CRITICAL RULE: ABSOLUTELY NO TEXT OR LETTERS anywhere on the image. ';
  
  // No text instruction (CRITICAL for clean visual storytelling) - repeated for emphasis
  const noTextSuffixInstruction = '. STRICTLY FORBIDDEN: No text, no letters, no words, no numbers, no symbols, no writing, no typography, no captions, no subtitles, no labels, no signs, no banners, no speech bubbles, no thought bubbles, no text on screens, no text on objects, no text on clothing, no text on buildings, no text on vehicles, no text anywhere. Pure visual storytelling ONLY - use images and colors to tell the story, NOT WORDS';
  
  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeGuidance = params.negativePrompt 
    ? `, avoid: ${params.negativePrompt}` 
    : '';
  
  // Aggressive text blocking in negative prompt
  const aggressiveTextBlocking = ', NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO TYPOGRAPHY, NO CAPTIONS, NO LABELS, NO SIGNS';
  
  const fullPrompt = `${noTextPrefixInstruction}${stylePrefix}${characterPart}, ${cleanVisualPrompt}${situationContext}, ${safetyAdditions}${referenceStyleEnforcement}${noTextSuffixInstruction}${aggressiveTextBlocking}${negativeGuidance}`;
  
  // Optimize prompt length to stay within limits
  return optimizePromptLength(fullPrompt, 2000);
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
 * Get style prefix for prompt based on selected art style and age group
 */
function getStylePrefix(style: string, ageGroup: string): string {
  const presets: Record<string, string> = {
    // Стиль: Прозрачность и подтеки. Никаких черных контуров.
    'soft_watercolor': 'ethereal watercolor painting, wet-on-wet technique, soft bleeding edges, no outlines, transparent layered washes, visible cold-press paper grain, delicate pastel palette, classic storybook aesthetics, Beatrix Potter style',
    
    // Стиль: Текстура и штрих. Максимальная имитация «ручной» работы.
    'colored_pencil': 'heavy-textured colored pencil drawing, visible wax strokes, cross-hatching technique, layered colors on grainy paper, soft sketchy outlines, handcrafted tactile feel, warm and nostalgic, Maurice Sendak inspired',
    
    // Стиль: Графика и контраст. Акцент на жирную черную тушь.
    'comic_line': 'bold ink-line comic art, clean black outlines, flat vibrant colors, halftone dot patterns in shadows, expressive cartoon gestures, Tintin and Hergé aesthetic, high contrast, graphic vector-like clarity',
    
    // Стиль: Свет и градиенты. Атмосфера японской анимации.
    'anime_light': 'classic 1990s hand-drawn cel animation aesthetic, authentic anime cel painting style, bold black outlines, hard-edged cel-shading with distinct shadow layers (no soft gradients on characters), flat saturated colors, detailed hand-painted watercolor backgrounds with visible brushstrokes, film grain texture, retro anime screen capture look',
    
    'retro_magical_shojo': 'hyper-cute retro 90s "magical girl" shojo anime aesthetic, resembling a vintage anime screenshot with film grain. Human characters must have enormous, highly expressive, "watery" sparkling anime eyes with multiple starburst highlights and glossy hair. Any animal or creature subjects must be rendered as tiny, exaggerated "chibi mascots" with oversized heads and massive sparkling eyes matching the humans. The entire scene is bathed in intense magical atmosphere: dramatic sunbeams (god rays), lens flares, floating cherry blossom petals, and excessive sparkling glitter effects covering everything. Bright, highly saturated color palette with distinct hard-edged cel-shading.',

    // Стиль: Объем и лоск. Ощущение дорогого мультфильма.
    'warm_3d': 'modern 3D CGI animation style, Pixar-like character design, soft subsurface scattering on skin, volumetric warm lighting, rounded glossy shapes, highly detailed fabric textures, ray-traced shadows, cinematic 4k render',
    
    // Стиль: Глубокие тени и свет. Ограниченная палитра.
    'night_calm': 'nocturnal atmospheric illustration, deep indigo and violet tones, glowing warm highlights, soft blurred edges, peaceful silence, stippling texture, magical night vibe, inspired by Goodnight Moon, high contrast between dark and light',
    
    // Стиль: Ткань и швы. Игрушечный, тактильный мир.
    'felt_craft': 'stop-motion felted wool aesthetic, handmade fabric collage, visible embroidery stitches and seams, fuzzy fiber textures, soft shadows between layers, craft material appearance, 3D felt puppets',
    
    // Стиль: Пластичность и отпечатки. Ощущение лепки.
    'clay': 'plasticine claymation style, hand-molded clay textures, visible fingerprints, soft matte finish, chunky solid shapes, Aardman animations look (Wallace & Gromit), playful stop-motion studio lighting',
  };
  
  const baseStyle = presets[style] || presets['soft_watercolor'];
  
  // Add age-appropriate enhancements
  if (ageGroup === '0-1' || ageGroup === '1y') {
    return `${baseStyle}, very simple shapes, minimal details, extremely soft and gentle`;
  } else if (ageGroup === '2-3' || ageGroup === '4-5') {
    return `${baseStyle}, simple clear shapes, bright friendly colors, child-friendly`;
  }
  
  return baseStyle;
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
  const stylePrefix = getStylePrefix(params.style, params.ageGroup);
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

/**
 * Build reference instruction for character consistency (Nano Banana Pro)
 * Based on official Google Cloud workflow for generating consistent imagery
 * 
 * @returns Instruction text to prepend to the prompt
 */
export function buildReferenceInstruction(): string {
  // Format based on official Nano Banana workflow from Google Cloud
  // Source: "Generating Consistent Imagery with Gemini" by Laurent Picard
  return `- Image 1: Reference image with all characters.

IMPORTANT! Use the attached reference image to keep the same appearance of all people, animals, and creatures:
- Preserve ALL character faces, facial features, and expressions
- Keep clothing details, colors, patterns, and accessories IDENTICAL
- Maintain character body proportions and sizes
- Preserve hair styles, colors, and details
- Keep any distinctive features (glasses, jewelry, scars, etc.)
- Maintain the same illustration style and art quality

CHANGE ONLY: scene background, character poses/positions, actions as described below.
NEVER add facial features or body parts that are not present in the reference image. Reproduce characters EXACTLY — no invented eyes, ears, or other features.`;
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
