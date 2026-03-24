/**
 * Image Prompt Engineering
 * Functions for building prompts for image generation with character consistency
 */

import { stripCharacterIdFromName } from '@wondertales/shared';
import { stripAllTags } from '../../utils/audioTags';
import { logger } from '../../utils/logger';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
import type { StoryEnvironment } from '../../ai/types';
import { getImageStylePrefix } from './styles';
import { getImageContentPolicy } from '../contentPolicy';
import { config } from '../../config';
import { lookupOutfitForCharacterName } from '../../utils/characterOutfits';

/**
 * Resolve outfit plate "Image N" index for a character (map keys may be full or base names).
 */
function resolveOutfitPlateImageIndex(
  characterName: string,
  plateMap?: Map<string, number>,
): number | undefined {
  if (!plateMap || plateMap.size === 0) return undefined;
  if (plateMap.has(characterName)) return plateMap.get(characterName);
  const base = stripCharacterIdFromName(characterName).trim();
  if (base && plateMap.has(base)) return plateMap.get(base);
  const lower = base.toLowerCase();
  for (const [k, v] of plateMap) {
    if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) return v;
  }
  return undefined;
}

function formatOutfitPlateCrossRef(plateIdx: number, identityImageIdx?: number): string {
  const noMannequin =
    ' Do not draw a wooden mannequin, jointed doll, or blank display head in this scene — only put those garments on the real character.';
  const imageOnly =
    ' Wardrobe source is Image only: do not blend with any other written outfit description — copy colors, patterns, silhouette, and layering exactly from this plate.';
  if (identityImageIdx !== undefined && identityImageIdx !== plateIdx) {
    return ` Wardrobe reference: Image ${plateIdx} shows the outfit on a display mannequin — use it for all garment details (cut, colors, patterns, layering). Image ${identityImageIdx} is the real character (face, hair, body).${imageOnly}${noMannequin}`;
  }
  return ` Wardrobe reference: Image ${plateIdx} shows clothes on a display mannequin — copy the wardrobe onto the story character, not the dummy.${imageOnly}${noMannequin}`;
}

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
  // Outfit plate indices (Image N) per character — must match reference interleave order
  outfitPlateImageIndexByCharacter?: Map<string, number>;
  // Current scene's environment (moved from system instruction to user prompt)
  currentEnvironment?: StoryEnvironment;
  // Scene-specific outfit overrides from text generation
  characterOutfits?: Record<string, string>;
  // Legacy params kept for non-reference (Imagen 3) path
  characters?: CharacterReference[];
  negativePrompt?: string;
  scenarioCardId?: string;
  // When true: SETTING uses only scene-specific delta (env image provides layout)
  hasEnvironmentImageRef?: boolean;
}): string {
  const imagePolicy = getImageContentPolicy({ ageGroup: params.ageGroup, scenarioCardId: params.scenarioCardId });
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

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
      outfitPlateImageIndexByCharacter: params.outfitPlateImageIndexByCharacter,
      currentEnvironment: params.currentEnvironment,
      characterOutfits: params.characterOutfits,
      hasEnvironmentImageRef: params.hasEnvironmentImageRef,
    });
  }

  // --- Legacy fallback (old stories with string visualPrompt) ---
  const cleanVisualPrompt = stripAllTags(params.visualPrompt || '');

  if (params.hasReferences) {
    const characterLines = buildCharacterSection(
      params.realWorldCharacters,
      params.referenceCharacterNames,
      true,
      params.imageIndexMap,
      params.characterOutfits,
      params.outfitPlateImageIndexByCharacter,
    );
    const charSection = characterLines ? `\n\n${characterLines}` : '';
    return `${stylePrefix}, ${cleanVisualPrompt}${charSection}, ${safetyAdditions}. Do not include any text, letters, captions, or character name labels in the image.`;
  }

  // Non-reference legacy path (Imagen 3)
  let characterPart = '';
  if (params.characters && params.characters.length > 0) {
    const characterDescriptions = buildCharacterDescriptions(params.characters);
    if (characterDescriptions) characterPart = `, ${characterDescriptions}`;
  }
  const noTextPrefix = 'CRITICAL RULE: ABSOLUTELY NO TEXT OR LETTERS anywhere on the image. ';
  const noTextSuffix = '. STRICTLY FORBIDDEN: No text, no letters, no words, no numbers, no symbols, no writing, no typography, no captions, no subtitles, no labels, no signs, no banners, no speech bubbles, no thought bubbles, no text on screens, no text on objects, no text on clothing, no text on buildings, no text on vehicles, no text anywhere. Pure visual storytelling ONLY';
  const negativeToUse = params.negativePrompt ?? imagePolicy.imageNegativePrompt;
  const negativeGuidance = negativeToUse ? `, avoid: ${negativeToUse}` : '';
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
  outfitPlateImageIndexByCharacter?: Map<string, number>;
  currentEnvironment?: StoryEnvironment;
  characterOutfits?: Record<string, string>;
  hasEnvironmentImageRef?: boolean;
}): string {
  const { sceneVisual, hasEnvironmentImageRef } = params;

  const sections: string[] = [];

  if (params.outfitPlateImageIndexByCharacter && params.outfitPlateImageIndexByCharacter.size > 0) {
    sections.push(
      '- Wardrobe plates: numbered images marked OUTFIT PLATE / mannequin are the only wardrobe source for those characters — do not invent clothing from prose. Transfer those garments onto the matching character sheet identity. Never depict the mannequin, doll joints, or blank mannequin head.',
    );
  }

  // SETTING (scene-specific). When env image ref: only delta, labeled "Scene-specific"
  if (sceneVisual.setting) {
    const settingLabel = hasEnvironmentImageRef ? 'Scene-specific' : 'Scene';
    sections.push(`- ${settingLabel}: ${sceneVisual.setting}`);
  }

  // CHARACTERS — with Image N back-references and inline descriptions
  const characterLines = buildCharacterSection(
    params.realWorldCharacters,
    params.referenceCharacterNames,
    params.hasReferences,
    params.imageIndexMap,
    params.characterOutfits,
    params.outfitPlateImageIndexByCharacter,
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

  // Safety and format: no text, no character captions/labels
  sections.push(`- CRITICAL: No text, no letters, no words, no character names, no captions, no labels anywhere on the image. Pure visual illustration only. ${params.safetyAdditions}`);

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
function structuralOutfitHint(outfitText: string): string {
  const t = outfitText.trim();
  if (!t) return '';
  return ` STRUCTURAL MATCH: Reproduce garment type, length, sleeves, footwear, and named accessories from the outfit text (${t.slice(0, 200)}${t.length > 200 ? '…' : ''}) — not a generic same-color substitute.`;
}

function buildCharacterSection(
  realWorldCharacters?: Array<{ name: string; description: string }>,
  referenceCharacterNames?: Array<string | { name: string; isTurnaround?: boolean }>,
  _hasReferences?: boolean,
  imageIndexMap?: Map<string, number>,
  characterOutfits?: Record<string, string>,
  outfitPlateImageIndexByCharacter?: Map<string, number>,
): string {
  const lines: string[] = [];

  // Imaginary creatures: short back-reference with Image N
  if (referenceCharacterNames) {
    for (const entry of referenceCharacterNames) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const imgIdx = imageIndexMap?.get(name);
      const plateIdx = resolveOutfitPlateImageIndex(name, outfitPlateImageIndexByCharacter);
      // When an outfit plate is attached, wardrobe must come from that image only — no text mix.
      const outfitOverride =
        plateIdx === undefined ? lookupOutfitForCharacterName(name, characterOutfits) : undefined;
      const structural = outfitOverride ? structuralOutfitHint(outfitOverride) : '';
      const outfitSuffix = outfitOverride ? `. Outfit in this scene: ${outfitOverride}.${structural}` : '';
      const plateSuffix =
        plateIdx !== undefined ? formatOutfitPlateCrossRef(plateIdx, imgIdx) : '';
      if (imgIdx) {
        const sheetType = (typeof entry !== 'string' && entry.isTurnaround) ? 'character design from the sheet' : 'reference photo';
        lines.push(`- ${name} (Image ${imgIdx}): match the ${sheetType}${outfitSuffix}${plateSuffix}`);
      } else {
        lines.push(`- ${name}: match the attached reference image${outfitSuffix}${plateSuffix}`);
      }
    }
  }

  // Real-world characters: inline description (moved from system instruction)
  if (realWorldCharacters) {
    for (const char of realWorldCharacters) {
      const imgIdx = imageIndexMap?.get(char.name);
      const plateIdx = resolveOutfitPlateImageIndex(char.name, outfitPlateImageIndexByCharacter);
      const outfitOverride =
        plateIdx === undefined ? lookupOutfitForCharacterName(char.name, characterOutfits) : undefined;
      const structural = outfitOverride ? structuralOutfitHint(outfitOverride) : '';
      const desc = outfitOverride
        ? `${char.description}. Outfit in this scene: ${outfitOverride}.${structural}`
        : char.description;
      const plateSuffix =
        plateIdx !== undefined ? formatOutfitPlateCrossRef(plateIdx, imgIdx) : '';
      if (imgIdx) {
        lines.push(`- ${char.name} (Image ${imgIdx}): ${desc}${plateSuffix}`);
      } else {
        lines.push(`- ${char.name}: ${desc}${plateSuffix}`);
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
 * Build prompt for environment reference image (Gemini Flash Image).
 * Fixed neutral style for easy re-drawing under any scene art style.
 */
export function buildEnvironmentImagePrompt(params: {
  environment: StoryEnvironment;
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({
    ageGroup: '4-5',
    scenarioCardId: params.scenarioCardId,
  });
  const stylePrefix =
    config.image.environmentImageStyle ||
    'clean line art, simple shapes, clear spatial layout';
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

  const parts = [
    stylePrefix,
    params.environment.description,
    'Key objects must be in fixed positions relative to each other. Maintain consistent spatial layout: left, center, right. Describe relationships (path beside tree, bushes left of path, house behind trees).',
    'Empty location, no people or animals, wide establishing shot.',
    safetyAdditions,
    'No text or letters in the image.',
  ];

  return parts.filter(Boolean).join('. ');
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
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({ ageGroup: params.ageGroup, scenarioCardId: params.scenarioCardId });
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const safetyAdditions = imagePolicy.imageSafetyAdditions;
  
  // ULTRA-STRONG no text instruction for portraits
  const noTextPrefixInstruction = 'CRITICAL: ABSOLUTELY NO TEXT OR LETTERS. ';
  const noTextSuffixInstruction = ', STRICTLY NO text, NO letters, NO words, NO writing, NO speech bubbles, NO captions, NO labels, NO text on clothing';
  
  // Build negative guidance as text (since API doesn't support negativePrompt parameter)
  const negativeGuidance = (params.negativePrompt ?? imagePolicy.imageNegativePrompt)
    ? `, avoid: ${params.negativePrompt ?? imagePolicy.imageNegativePrompt}`
    : '';
  
  // Aggressive text blocking
  const aggressiveTextBlocking = ', NO TEXT, NO LETTERS, NO WORDS ANYWHERE';
  
  return `${noTextPrefixInstruction}${stylePrefix}, character portrait, close-up view, ${params.description}, clear details, front-facing${noTextSuffixInstruction}, ${safetyAdditions}${aggressiveTextBlocking}${negativeGuidance}`;
}

/**
 * Text-to-image prompt for a canonical outfit plate (Gemini Flash Image).
 * Minimal prompt: centered mannequin + `characterOutfits` string does the work (long rules tended to leak as fake UI).
 */
export function buildOutfitPlatePrompt(params: {
  outfitDescription: string;
  imageStyle: string;
  ageGroup: string;
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({
    ageGroup: params.ageGroup,
    scenarioCardId: params.scenarioCardId,
  });
  const safetyAdditions = imagePolicy.imageSafetyAdditions;
  const spec = params.outfitDescription.trim().replace(/\.+$/, '').trim();

  return [
    `Children's book illustration, ${params.imageStyle}: one wooden artist mannequin stands in the center, full length, facing forward, blank smooth head, wearing ${spec}.`,
    'Plain soft background. No letters or words in the image. Only this one mannequin.',
    safetyAdditions,
  ]
    .filter(Boolean)
    .join(' ');
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
  hasEnvironmentReference?: boolean;
  scenarioCardId?: string;
}): string {
  const imagePolicy = getImageContentPolicy({ ageGroup: params.ageGroup, scenarioCardId: params.scenarioCardId });
  const stylePrefix = getImageStylePrefix(params.style, params.ageGroup, params.scenarioCardId);
  const safetyAdditions = imagePolicy.imageSafetyAdditions;

  const sections: string[] = [];

  // Role
  sections.push('You are a professional children\'s book illustrator.');

  // Art style
  sections.push(`ART STYLE: ${stylePrefix}`);

  // Format rules
  sections.push(
    'FORMAT: Single full-bleed illustration filling the frame edge-to-edge. No text, no speech bubbles, no character name labels, no captions under characters, no written words anywhere. Pure visual storytelling only.',
  );

  // Reference image rules (only when turnaround sheets are attached)
  if (params.hasReferences) {
    sections.push(
      'REFERENCES: Character sheets establish IDENTITY: face, age, body proportions, silhouette, skin/hair palette, distinctive marks (freckles, glasses if part of the character in this story). ' +
      'Match those consistently. Re-draw in the scene art style (sheets are design reference only). ' +
      'CLOTHING vs SHEET: Default clothes on the character sheet may be ignored when the story supplies different wardrobe. ' +
      'NUMBERED IMAGES: Each reference image is preceded by a line "Image N: …". When the user prompt pairs identity Image M with an outfit plate Image N, use M for face, hair, and body identity; use N as the sole source for all clothing (colors, patterns, silhouette). Do not merge a separate text outfit description with the plate. ' +
      'If there is no outfit plate for a character, wardrobe may come from the user prompt text (characterOutfits / scene lines) and composition. ' +
      'Outfit plates show wardrobe on a wooden display mannequin — that mannequin must never appear in the final scene. Ignore its head, limbs, and joints for identity; transfer only the clothes onto the living character from Image M.',
    );
  }

  // Environment reference rules (when env image is attached)
  if (params.hasEnvironmentReference) {
    sections.push(
      'ENVIRONMENT REFERENCE: The provided location image is for CONTENT only (layout, spatial structure, composition, objects, furniture, atmosphere) — NOT for style. Re-draw everything in the scene\'s art style. Ignore the reference\'s rendering style completely. Key objects (tree, building, furniture) must stay in the SAME positions as in the reference. Character positions are relative to these fixed objects.',
    );
  }

  // Clothing: outfit comes from environment.characterOutfits (per-environment, consistent within location)
  sections.push(
    'CLOTHING: When an outfit plate (mannequin) reference exists for a character, that image is the only wardrobe specification — ignore duplicate outfit prose for that character. Otherwise, characterOutfits text in the prompt is wardrobe-only (not face/hair). Hair, expression, and facial identity come from character sheets and cameraComposition. Never paint the mannequin in the scene; face and body from the character sheet.',
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
