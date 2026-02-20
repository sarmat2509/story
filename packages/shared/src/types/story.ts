/**
 * Story Configuration Types - Database-driven
 * All types represent data loaded from database tables
 */

export interface StoryGoal {
  slug: string;
  name: string;
  description: string;
  promptGuidance: string;
  minAge: number;
  sortOrder: number;
}

export interface StoryTone {
  slug: string;
  name: string;
  description: string;
  promptGuidance: string;
  writingStyle: {
    pacing: string;
    emotionalIntensity: string;
    sensoryFocus: string;
    sentenceRhythm: string;
  };
  sortOrder: number;
}

export interface ContentPolicyRule {
  id: string;
  category: string;
  description: string;
  prohibitedElements: string[];
  examples: {
    forbidden: string[];
    allowed: string[];
  };
  promptGuidance: string;
  severity: 'critical' | 'high' | 'medium';
  sortOrder: number;
}

export interface AgeEngineRule {
  ageGroup: string;
  sceneCount: number;
  wordRangeMin: number;
  wordRangeMax: number;
  maxSentenceLength: number;
  vocabulary: string;
  dialogRatio: number;
  themes: string[];
  fearLevel: number;
  allowedConflicts: string[];
  additionalRules: string;
}

export interface ScenarioCard {
  id: string;
  nameKey: string; // i18n key
  descriptionKey: string; // i18n key
  icon: string | null;
  suggestedGoals: string[]; // array of goal slugs
  ageGroups: string[]; // array like ['2-3', '4-5']
  sortOrder: number;
  isActive: boolean;
}

/**
 * Structured visual description for image generation
 */
export interface SceneVisual {
  setting: string;
  cameraComposition: string;
  lighting: string;
}

/**
 * Story Scene structure for database storage
 * Prepared for M4 image generation
 */
export interface StoryScene {
  sceneId: number;
  text: string;
  sceneVisual?: SceneVisual; // Structured visual description for image generation
  visualPrompt?: string; // Deprecated: kept for backward compatibility with old stories
  imageUrl?: string | null;
  imageGeneratedAt?: string | null;
}
