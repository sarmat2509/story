/**
 * Common shared types used across the application
 */

export interface ReferencePhoto {
  url: string;
  uploadedAt: string;
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

export interface ChildProfileData {
  id: string;
  userId: string;
  name: string;
  birthDate: Date | string;
  gender?: string | null;
  languages: any;
  referencePhotos?: ReferencePhoto[];
  aiGeneratedDescription?: string; // AI-generated narrative description
  appearanceTraits?: AppearanceTraits;
  personality?: any;
  interests?: any;
  sensitivities?: any;
  familyCast?: any;
  isActive: boolean;
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
