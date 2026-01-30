/**
 * Type definitions for Story Orchestration
 * Replaces 'any' types with proper interfaces
 */

import { 
  ReferencePhoto, 
  AppearanceTraits, 
  ChildProfileData, 
  CharacterData 
} from '@kazka/shared';

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
  tone?: string | null;
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

export interface SceneData {
  sceneId: number;
  text: string;
  visualPrompt: string;
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
    visualPrompt: string;
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

export interface ImageGenerationContext {
  childProfile?: ChildProfileData;
  characters: CharacterData[];
  userStyle?: string;
  ageGroup: string;
  userPlan: {
    imagesPerStory: number;
    imageQuality: string;
    imageRegenerationPerDay: number;
    allowReferencePhotos: boolean;
    allowGeneratedReferences: boolean;
    storiesPerDay: number;
    audioMinutesPerMonth: number;
  };
  userId: string;
  assetStorage: any; // Keep as any for now to avoid circular deps
  imageDomain: any; // Keep as any for now to avoid circular deps
  // NEW: Scene context from outline
  sceneGoal?: string;
  sceneBeats?: string[];
  sceneEmotion?: string;
}

export interface PlanFeatures {
  imagesPerStory: number;
  imageQuality: string;
  imageRegenerationPerDay: number;
  allowReferencePhotos: boolean;
  allowGeneratedReferences: boolean;
  storiesPerDay: number;
  audioMinutesPerMonth: number;
}

export interface AssetStorageService {
  uploadAsset(params: any): Promise<any>;
  deleteAsset(path: string): Promise<void>;
  generateSignedUrl(path: string, hours?: number): Promise<any>;
}

export interface ImageDomainService {
  generateSceneIllustration(request: any): Promise<any>;
  generateCharacterPortrait(request: any): Promise<any>;
  buildImageStyle(ageGroup: string, userStyle?: string): string;
}
