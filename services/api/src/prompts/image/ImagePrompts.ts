/**
 * Image Prompt Engineering
 * Functions for building prompts for image generation with character consistency
 */

export interface CharacterReference {
  name: string;
  referencePhotos?: Array<{ url: string; purpose?: string }>;
  appearanceTraits?: any;
  appearance?: string; // LLM-generated description
  description?: string;
}

/**
 * Build complete image prompt for a scene
 * Includes style, characters, scene description, and safety additions
 */
export function buildSceneImagePrompt(params: {
  visualPrompt: string;
  ageGroup: string;
  style: string;
  characters?: CharacterReference[];
  hasReferences?: boolean; // Flag indicating reference photos are available
}): string {
  const stylePrefix = getStylePrefix(params.style, params.ageGroup);
  const safetyAdditions = getSafetyPromptAdditions(params.ageGroup);
  
  // If no characters or no references, generate simple prompt
  if (!params.characters || params.characters.length === 0 || !params.hasReferences) {
    return `${stylePrefix}, ${params.visualPrompt}, ${safetyAdditions}`;
  }
  
  // If characters exist, add their descriptions
  const characterDescriptions = buildCharacterDescriptions(params.characters);
  return `${stylePrefix}, ${characterDescriptions}, ${params.visualPrompt}, ${safetyAdditions}`;
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
    'text', 'watermark', 'logo', 'signature',
    'photorealistic', 'photo',
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
    'soft_watercolor': 'soft watercolor children\'s book illustration, paper texture, pastel colors, gentle outlines, warm cozy mood',
    'colored_pencil': 'colored pencil drawing, light sketch lines, soft shading, white paper background, hand-drawn style',
    'comic_line': 'clean lineart, comic panel style, simple cel shading, bold but friendly outlines, cartoon style',
    'anime_light': 'anime-inspired illustration, soft cel shading, expressive eyes, clean outlines, bright friendly palette',
    'warm_3d': '3D family animation style, Pixar-like, warm soft lighting, rounded shapes, friendly faces, smooth textures',
    'night_calm': 'nighttime cozy scene, deep blue palette, warm lamp highlights, calm atmosphere, not scary, peaceful',
    'felt_craft': 'felt craft style, fabric texture, handmade look, stitched details, soft depth, tactile appearance',
    'clay': 'claymation style, soft clay texture, gentle lighting, rounded friendly shapes, stop-motion aesthetic',
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
}): string {
  const stylePrefix = getStylePrefix(params.style, params.ageGroup);
  const safetyAdditions = getSafetyPromptAdditions(params.ageGroup);
  
  return `${stylePrefix}, character portrait, close-up view, ${params.description}, clear details, front-facing, ${safetyAdditions}`;
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
