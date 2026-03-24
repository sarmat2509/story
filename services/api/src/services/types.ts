/**
 * Type definitions for Story Orchestration
 * Replaces 'any' types with proper interfaces
 */

import { 
  ReferencePhoto, 
  AppearanceTraits, 
  ChildProfileData, 
  CharacterData 
} from '@wondertales/shared';

// Re-export for convenience
export type { 
  ReferencePhoto, 
  AppearanceTraits, 
  ChildProfileData, 
  CharacterData 
};

export interface StoryRequestData {
  id: string;
  userId: string;
  childProfileId?: string | null;
  uiLocale: string;
  storyLanguage: string;
  goal?: string | null;
  scenarioCardId?: string | null;
  imageStyle?: string | null; // Image art style
  userNotes?: string | null;
  selectedCharacters?: string[]; // Array of character UUIDs selected by user
  selectedChildren?: string[]; // NEW: Array of child profile UUIDs to include in story
  status: string;
  progress: number | null;
  progressData?: any;
  storyId?: string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Per-character composition entry inside the structured cameraComposition.
 */
export interface CameraCharacterComposition {
  name: string; // Character name (EXACT from the story character list)
  description: string; // Position, posture, action, expression, gaze
  /** References outfits[].id for this scene (required in LLM JSON schema). */
  outfitId?: string;
}

/**
 * Structured visual description for image generation.
 * Replaces the old single-string `visualPrompt`.
 *
 * `cameraComposition` can be:
 *   - A structured object (new stories) with shot + characters array
 *   - A plain string (backward compatibility with old stories)
 */
export interface SceneVisual {
  setting: string;
  cameraComposition: string | {
    shot: string;
    characters: CameraCharacterComposition[];
  };
  lighting: string;
}

/**
 * Flatten a structured or string cameraComposition into a text string
 * and extract character names (if structured).
 * Used by image prompt builders and validation to get a consumable text form.
 */
export function flattenCameraComposition(
  cam: SceneVisual['cameraComposition']
): { text: string; characterNames: string[] } {
  if (typeof cam === 'string') {
    // Backward compatibility with old string format
    return { text: cam, characterNames: [] };
  }
  const text = `${cam.shot}. ${cam.characters.map(c => `${c.name}: ${c.description}`).join(' ')}.`;
  const characterNames = cam.characters.map(c => c.name);
  return { text, characterNames };
}

export interface SceneData {
  sceneId: number;
  text: string;
  sceneVisual?: SceneVisual; // Structured visual description for image generation
  visualPrompt?: string; // Deprecated: kept for backward compatibility with old stories
  /** Maps character name → outfit id from story root `outfits[]` (new format). */
  characterOutfitIds?: Record<string, string>;
  characterOutfits?: Record<string, string>; // Legacy per-scene outfit override: charName -> description
}

export interface StoryTextData {
  title: string;
  language: string;
  scenes: SceneData[];
  fullText: string;
  wordCount: number;
}

export interface OutlineData {
  title: string;
  characters?: LLMCharacter[];
  scenes: Array<{
    sceneId: number;
    sceneVisual?: SceneVisual;
    visualPrompt?: string; // Deprecated: kept for backward compatibility
    setting?: string;
  }>;
}

export interface LLMCharacter {
  name: string;
  role: 'main' | 'supporting' | 'minor';
  type: 'child' | 'adult' | 'animal' | 'magical_creature' | 'object';
  appearance: string;
  personality?: string;
}

/** Wardrobe definitions from story JSON (`outfits` array). */
export type StoryOutfitEntry = { id: string; characterName: string; description: string };

export interface ImageGenerationContext {
  childProfile?: ChildProfileData;
  characters: CharacterData[];
  userStyle?: string;
  ageGroup: string;
  scenarioCardId?: string;
  /** When present with scene.characterOutfitIds, resolves wardrobe for image gen / validation. */
  storyOutfits?: StoryOutfitEntry[];
  userPlan: {
    imagesPerStory: number;
    imageQuality: string;
    imageRegenerationPerDay: number;
    allowReferencePhotos: boolean;
    storiesPerMonth: number;
    audioStoriesPerMonth: number;
  };
  userId: string;
  assetStorage: any; // Keep as any for now to avoid circular deps
  imageDomain: any; // Keep as any for now to avoid circular deps
}

export interface PlanFeatures {
  imagesPerStory: number;
  imageQuality: string;
  imageRegenerationPerDay: number;
  allowReferencePhotos: boolean;
  storiesPerMonth: number;
  audioStoriesPerMonth: number;
}

export interface AssetStorageService {
  uploadAsset(params: any): Promise<any>;
  deleteAsset(path: string): Promise<void>;
  generateSignedUrl(path: string, hours?: number): Promise<any>;
}

export interface ImageDomainService {
  generateSceneIllustration(request: any): Promise<any>;
  buildImageStyle(ageGroup: string, userStyle?: string): string;
}
