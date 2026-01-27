/**
 * Type definitions for Story Orchestration
 * Replaces 'any' types with proper interfaces
 */

export interface StoryRequestData {
  id: string;
  userId: string;
  childProfileId?: string | null;
  uiLocale: string;
  storyLanguage: string;
  goal?: string | null;
  tone?: string | null;
  scenarioCardId?: string | null;
  userNotes?: string | null;
  status: string;
  progress: number | null;
  progressData?: any;
  storyId?: string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChildProfileData {
  id: string;
  userId: string;
  name: string;
  birthDate: Date | string;
  gender?: string | null;
  languages: any;
  referencePhotos?: ReferencePhoto[];
  appearanceTraits?: AppearanceTraits;
  personality?: any;
  interests?: any;
  sensitivities?: any;
  familyCast?: any;
  isActive: boolean;
}

export interface ReferencePhoto {
  url: string;
  purpose?: string;
  description?: string;
}

export interface AppearanceTraits {
  hairColor?: string;
  hairStyle?: string;
  eyeColor?: string;
  skinTone?: string;
  height?: string;
  build?: string;
  clothingStyle?: string;
}

export interface CharacterData {
  id?: string;
  name: string;
  type: string;
  referencePhotos?: ReferencePhoto[];
  appearanceTraits?: AppearanceTraits;
  description?: string;
  appearance?: string; // LLM-generated detailed description
  role?: string;
  personality?: any;
  traits?: any;
  source?: 'llm_generated' | 'user_enriched_by_llm' | 'user_provided';
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
