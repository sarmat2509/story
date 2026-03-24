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
    category: 'content_policy' | 'age_inappropriate' | 'fear_level' | 'emotional_tone' | 'vocabulary' | 'camera_composition_incomplete';
    severity: 'critical' | 'high' | 'medium';
    message: string;
    suggestion?: string;
  }>;
  /** When cameraComposition has issues (missing/extra characters), the corrected version. Applied directly without scene regeneration. */
  correctedCameraComposition?: { shot: string; characters: Array<{ name: string; description: string }> };
}

/**
 * Image validation result - for post-generation image quality checks using Vision model.
 * Detects character hallucinations, duplicates, missing characters, reference fidelity issues.
 */
export interface ImageValidationResult {
  characterCount: number;
  expectedCharacterCount: number;
  characters: Array<{
    name: string;
    /** Echo expected list: human vs imaginary — must match isImaginary from validation input. */
    characterKind: 'human' | 'imaginary';
    found: boolean;
    duplicated: boolean;
    recognizableScore: number; // 0-1 aggregate identity score; must align with boolean identity flags below.
    faceMatchesReference: boolean;
    hairMatchesReference: boolean;
    ageReadMatchesReference: boolean;
    proportionsMatchReference: boolean;
    matchesColors: boolean;
    matchesOutfit: boolean;
    /** Explicit age/face/hair/proportions/stable traits vs reference — no vague "similar enough". */
    identityComparisonSummary: string;
    /** When set: whether silhouette, body type, and first-glance read match the reference design. */
    sameOverallDesignRead?: boolean;
    /** When set: how much silhouette/body-type drift vs reference (structured output hint). */
    silhouetteDriftSeverity?: 'none' | 'mild' | 'moderate' | 'severe';
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
  worldRule?: { name: string; description: string }; // World rule for scenario (randomly selected)
}

/**
 * Story environment - persistent location/setting description
 * Used for consistent image generation across scenes sharing the same location
 */
export interface StoryEnvironment {
  id: string;
  name: string;
  description: string; // Base visual description (English)
  characterOutfits?: string; // "Char1: outfit1. Char2: outfit2." — parsed to Record for image gen
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
/** Canonical wardrobe row from structured text generation (matches TEXT_SCHEMA). */
export interface StoryOutfitRow {
  id: string;
  characterName: string;
  description: string;
}

export interface EpisodeText {
  title: string;
  language: string;
  environments?: StoryEnvironment[]; // Persistent location descriptions
  /** Canonical wardrobe; scenes reference rows via sceneVisual.cameraComposition.characters[].outfitId (LLM) → normalized to characterOutfitIds. */
  outfits?: StoryOutfitRow[];
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
    /** After normalization: maps character name → outfit id from outfits[] (from camera composition or legacy outfitBindings). */
    characterOutfitIds?: Record<string, string>;
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
   * Regenerate scene text based on validation feedback.
   * Returns plain text only. Fixes only policy violations.
   */
  regenerateScene(
    spec: StorySpec,
    outline: EpisodeOutline,
    sceneId: number,
    originalSceneText: string,
    validationFeedback: string
  ): Promise<string>;
}
