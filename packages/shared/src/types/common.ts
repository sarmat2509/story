/**
 * Common shared types used across the application
 * 
 * Note: CharacterData is for internal story generation context.
 * For DB entity Character, use Character from './index'
 */

export interface ReferencePhoto {
  url: string;
  uploadedAt: string;
  purpose?: string;
  description?: string;
}

/**
 * Basic appearance traits for internal use (child profiles).
 * Note: For Character DB entity, use AppearanceTraits union type from index.ts
 * (PetAppearance | HumanAppearance | ImaginaryAppearance)
 */
export interface BasicAppearanceTraits {
  hairColor?: string;
  hairStyle?: string;
  eyeColor?: string;
  skinTone?: string;
  height?: string;
  build?: string;
  clothingStyle?: string;
}

export interface ChildProfileData {
  id: string;
  userId: string;
  name: string;
  birthDate: Date | string;
  storyCreationMode?: 'instant' | 'artisan';
  storyTextSizeMultiplier?: number;
  languages: any;
  referencePhotos?: ReferencePhoto[];
  aiGeneratedDescription?: string; // AI-generated narrative description
  descriptionLanguage?: string;
  turnaroundSheet?: {
    url: string;
    frontUrl?: string;
    frontThumbnailUrl?: string;
    generatedAt?: string;
    sourcePhotoUrl?: string;
  };
  appearanceTraits?: BasicAppearanceTraits;
  personality?: any;
  interests?: any;
  sensitivities?: any;
  familyCast?: any;
  isActive: boolean;
  childModeEnabled?: boolean;
  childModeSettings?: ChildModeSettings;
  childModePasscodeConfigured?: boolean;
  childModeActiveSessionCount?: number;
  authorPseudonym?: string | null;
  authorAboutMe?: string | null;
}

export interface ChildModeSettings {
  storyGenerationEnabled: boolean;
  publicStoriesEnabled: boolean;
  dailyGenerationLimit: number | null;
  dailyAudioGenerationLimit: number | null;
  monthlyGenerationLimit: number | null;
  allowedThemeSlugs: string[];
  allowedLanguageCodes: string[];
  allowedCharacterIds: string[];
  freeTextPromptsEnabled: boolean;
  audioGenerationEnabled: boolean;
  quizGenerationEnabled: boolean;
  parentReviewRequired: boolean;
  allowSiblingCharacters: boolean;
  allowSharedFamilyStories: boolean;
}

/**
 * Character data for internal story generation context.
 * Note: This is NOT the DB entity. For DB Character, use Character from './index'.
 * appearanceTraits here can be any format (simple object, or full AppearanceTraits union).
 */
export interface CharacterData {
  id?: string;
  name: string;
  canonicalName?: string;
  nameAliases?: string[];
  type: string;
  subtype?: string | null;
  childProfileId?: string | null;
  referencePhotos?: ReferencePhoto[];
  appearanceTraits?: any; // Flexible - can be BasicAppearanceTraits or full union type
  description?: string;
  appearance?: string; // LLM-generated detailed description
  role?: string;
  personality?: any;
  traits?: any;
  source?: 'llm_generated' | 'user_enriched_by_llm' | 'user_provided';
}
