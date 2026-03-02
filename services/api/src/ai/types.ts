/**
 * AI Provider Interfaces for Story Generation (Milestone 3)
 * These interfaces abstract AI providers for text generation
 */

import type { CharacterData, SceneVisual } from '../services/types';

/**
 * Scene validation result - for parallel scene-by-scene validation
 */
export interface SceneValidationResult {
  sceneId: number;
  isValid: boolean;
  violations: Array<{
    category: 'content_policy' | 'age_inappropriate' | 'fear_level' | 'emotional_tone' | 'vocabulary';
    severity: 'critical' | 'high' | 'medium';
    message: string;
    suggestion?: string;
  }>;
}

/**
 * Image validation result - for post-generation image quality checks using Vision model.
 * Detects character hallucinations, duplicates, missing characters, reference fidelity issues.
 */
export interface ImageValidationResult {
  isValid: boolean;
  characterCount: number;
  expectedCharacterCount: number;
  characters: Array<{
    name: string;
    found: boolean;
    duplicated: boolean;
    recognizableScore: number;  // 0-1. 1=fully recognizable, 0.9=1 feature wrong, 0=completely different. Penalty=(1-score)*20.
    matchesColors: boolean;    // Correct color palette (fur, eyes, skin)
    matchesOutfit: boolean;    // Correct clothing/accessories (true if none described)
    issue?: string;
  }>;
  hasUnexpectedCharacters: boolean;
  hasTextOrLetters: boolean;
  hasRenderingArtifacts: boolean;
  overallFeedback: string; // Human-readable summary for logging
}

/**
 * Policy profile configuration for content safety
 */
export interface PolicyProfile {
  ageGroup: string;
  language: string;
  disallowedRules: Array<{
    id: string;
    category: string;
    prohibitedElements: string[];
    examples: { forbidden: string[]; allowed: string[] };
    severity: string;
  }>;
  fearLevelMax: number;
  allowedConflicts: string[];
  constraints: {
    mustHaveHappyEnding: boolean;
    noShamingLanguage: boolean;
  };
  readability: {
    maxSentenceLen: number;
    targetWordsRange: [number, number];
    dialogRatio: number;
  };
  promptGuidelines: string;
}

/**
 * Story specification for AI generation
 */
export interface StorySpec {
  language: string;
  ageGroup: string;
  childName?: string; // Optional - only set if child is a character in the story
  goal?: string;
  goalName?: string; // NEW: Translated goal name for prompts
  goalGuidance?: string; // NEW: Detailed guidance for the moral/goal (30-50 words)
  tone?: string;
  characters: CharacterData[];
  userNotes?: string;
  imageStyle?: string; // Image art style (soft_watercolor, colored_pencil, etc.)
  policyProfile: PolicyProfile;
  childProfile?: any; // Used for image generation context
  scenarioCard?: { // NEW: Scenario card theme
    id: string;
    name: string;
    description: string;
    promptGuidance?: string; // NEW: Detailed plot guidance
  };
  scenarioGuidance?: string; // NEW: Detailed plot guidance (30-50 words)
}

/**
 * Story environment - persistent location/setting description
 * Used for consistent image generation across scenes sharing the same location
 */
export interface StoryEnvironment {
  id: string;
  name: string;
  description: string; // Base visual description (English)
}

/**
 * Episode outline - high-level story structure
 * Each scene includes sceneVisual for future image generation (M4)
 */
export interface EpisodeOutline {
  title: string;
  language: string;
  moral: string;
  environments?: StoryEnvironment[]; // Persistent location descriptions
  scenes: Array<{
    sceneId: number;
    setting: string;
    goal: string;
    emotion: string;
    beats: string[];
    sceneVisual?: SceneVisual; // Structured visual description for image generation
    visualPrompt?: string; // Deprecated: kept for backward compatibility with old outlines
    environmentId?: string; // Reference to environment where this scene takes place
  }>;
  safetyNotes: string[];
}

/**
 * Episode text - full story content
 * Scene-by-scene structure prepared for M4 image generation
 */
export interface EpisodeText {
  title: string;
  language: string;
  environments?: StoryEnvironment[]; // Persistent location descriptions
  characters?: Array<{ // NEW - optional for backward compatibility
    name: string;
    type: string;
    description: string;
    role?: string;
    personality?: string;
  }>;
  scenes: Array<{
    sceneId: number;
    text: string; // Text for this specific scene
    sceneVisual?: SceneVisual; // Structured visual description for image generation
    visualPrompt?: string; // Deprecated: kept for backward compatibility with old stories
    environmentId?: string; // Reference to environment where this scene takes place
    characters?: string[]; // Character names appearing in this scene (optional for backward compatibility)
  }>;
  fullText: string; // Concatenated full story for reading
  wordCount: number;
  moral?: string; // For direct generation mode
}

/**
 * Text provider interface - abstracts AI text generation
 */
export interface TextProvider {
  generateText(spec: StorySpec): Promise<EpisodeText>;
  
  /**
   * Validate a single scene for content safety and age-appropriateness
   * Used for parallel scene-by-scene validation
   */
  validateScene(
    sceneOutline: EpisodeOutline['scenes'][0],
    sceneText: EpisodeText['scenes'][0],
    policy: PolicyProfile,
    isLastScene: boolean
  ): Promise<SceneValidationResult>;
  
  /**
   * Regenerate a single scene with validation feedback
   * Used for selective scene regeneration
   */
  regenerateScene(
    spec: StorySpec,
    outline: EpisodeOutline,
    sceneId: number,
    validationFeedback: string
  ): Promise<EpisodeText['scenes'][0]>;
}
