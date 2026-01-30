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
  
  // No text instruction (CRITICAL for clean visual storytelling)
  const noTextInstruction = '. IMPORTANT: No text, no speech bubbles, no captions, no written words on the image - pure visual storytelling only';
  
  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeGuidance = params.negativePrompt 
    ? `, avoid: ${params.negativePrompt}` 
    : '';
  
  return `${stylePrefix}${characterPart}, ${params.visualPrompt}${situationContext}, ${safetyAdditions}${referenceStyleEnforcement}${noTextInstruction}${negativeGuidance}`;
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
    'text', 'watermark', 'logo', 'signature',
    'speech bubbles', 'dialogue bubbles', 'text bubbles', 'captions',
    'subtitles', 'written text', 'letters', 'words on image',
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
    'soft_watercolor': 'cartoon illustration in soft watercolor style like classic Winnie the Pooh books, Peter Rabbit (Beatrix Potter), or The Velveteen Rabbit, NOT photorealistic, NOT a photo, paper texture, gentle painted brushstrokes, pastel colors, classic children\'s book illustration art',
    
    'colored_pencil': 'cartoon illustration drawn with colored pencils like Where the Wild Things Are, The Giving Tree, or Corduroy books, NOT photorealistic, hand-drawn cartoon characters with visible pencil strokes, soft shading, artistic children\'s book illustration',
    
    'comic_line': 'cartoon illustration in comic style like Calvin and Hobbes, Peanuts, or Tintin adventures, NOT photorealistic, clean lineart, comic panel art, simple cel shading, friendly cartoon faces, graphic novel for children',
    
    'anime_light': 'cartoon illustration in anime style like Studio Ghibli films (My Neighbor Totoro, Kiki\'s Delivery Service), Pokemon anime, or Doraemon, NOT photorealistic, NOT a photo, soft cel-shaded animation art, large expressive anime eyes, clean outlines, bright friendly anime palette, Japanese children\'s animation style like Ghibli or Pokemon',
    
    'warm_3d': 'cartoon illustration in 3D animated style like Pixar films (Toy Story, Finding Nemo, Up), Disney 3D movies (Frozen, Moana), or Illumination (Despicable Me), NOT photorealistic, 3D cartoon characters, warm soft lighting, rounded shapes, smooth cartoon textures, family animation movie style',
    
    'night_calm': 'cartoon illustration of nighttime scene like Goodnight Moon or Owl Babies books, NOT photorealistic, soft children\'s book art, deep blue calm palette, warm lamp glow, peaceful bedtime story illustration, not scary, gentle night scene',
    
    'felt_craft': 'cartoon illustration in handmade craft style like felt storybooks or craft animations, NOT photorealistic, fabric texture, handmade look with visible stitching, soft tactile appearance, children\'s craft art style',
    
    'clay': 'cartoon illustration in claymation style like Wallace & Gromit, Shaun the Sheep, or Chicken Run, NOT photorealistic, soft clay texture, stop-motion puppet animation aesthetic, rounded friendly shapes, Aardman-style clay animation art',
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
  
  // No text instruction
  const noTextInstruction = ', no text, no speech bubbles, no captions';
  
  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeGuidance = params.negativePrompt 
    ? `, avoid: ${params.negativePrompt}` 
    : '';
  
  return `${stylePrefix}, character portrait, close-up view, ${params.description}, clear details, front-facing${noTextInstruction}, ${safetyAdditions}${negativeGuidance}`;
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

CHANGE ONLY: scene background, character poses/positions, actions as described below.`;
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
