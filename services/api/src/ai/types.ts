/**
 * AI Provider Interfaces for Story Generation (Milestone 3)
 * These interfaces abstract AI providers for text generation
 */

import type { Locale } from '@wondertales/shared';
import type { CharacterData, MapTileVisual, SceneVisual } from '../services/types';

/**
 * Scene validation result - for parallel scene-by-scene validation
 */
export interface SceneValidationResult {
  validationStatus?: 'completed' | 'provider_blocked';
  /** Debug manifest for admin-only persistence. */
  requestManifest?: Record<string, unknown>;
  /** Computed 0-100 scene score derived from validation verdict and violation severity. */
  validationScore?: number | null;
  sceneId: number;
  isValid: boolean;
  violations: Array<{
    category:
      | 'content_policy'
      | 'age_inappropriate'
      | 'fear_level'
      | 'emotional_tone'
      | 'vocabulary'
      | 'language_clarity'
      | 'causal_link_missing'
      | 'means_end_mismatch'
      | 'problem_resolution_gap'
      | 'motivation_gap'
      | 'setup_payoff_gap'
      | 'continuity_error'
      | 'physical_or_world_logic_error'
      | 'reserved_character_identity_conflict'
      | 'reserved_name_reused_for_new_entity'
      | 'character_identity_unclear'
      | 'graphic_novel_page_cast_limit'
      | 'graphic_novel_panel_cast_limit'
      | 'graphic_novel_child_anchor_missing'
      | 'graphic_novel_cast_coverage_missing';
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
  /** Machine-readable run status. Missing means legacy completed validation. */
  validationStatus?: 'completed' | 'provider_blocked';
  /** Model/provider attempt that produced this result, or the last blocked attempt. */
  validationAttemptKind?: string;
  /** Model id that produced the visual verdict, or the last blocked model. */
  validationModelUsed?: string;
  /** Provider error when validation could not produce a visual verdict. */
  providerError?: string;
  /** Debug manifest for admin-only persistence. */
  requestManifest?: Record<string, unknown>;
  characterCount: number;
  expectedCharacterCount: number;
  characters: Array<{
    name: string;
    /** Echo expected roster KIND: human (person/child), animal (real-world species), imaginary (fictional creature). */
    characterKind: 'human' | 'animal' | 'imaginary';
    found: boolean;
    duplicated: boolean;
    recognizableScore: number; // 0-1 aggregate identity score; must align with boolean identity flags below.
    /** HUMAN identity slot. Null for animal/imaginary or when no reference is available. */
    faceMatchesReference?: boolean | null;
    /** HUMAN identity slot. Null for animal/imaginary or when no reference is available. */
    hairMatchesReference?: boolean | null;
    /** HUMAN identity slot. Null for animal/imaginary or when no reference is available. */
    ageReadMatchesReference?: boolean | null;
    /** Head-to-body proportions. Applies to all kinds; null when no reference is available. */
    proportionsMatchReference?: boolean | null;
    matchesColors: boolean;
    matchesOutfit: boolean;
    /** What is actually visible in the expected character slot when the expected identity is missing or wrong. */
    actualVisibleDescription?: string | null;
    /** Explicit age/face/hair/proportions/stable traits vs reference — no vague "similar enough". */
    identityComparisonSummary: string;
    /** When set: whether silhouette, body type, and first-glance read match the reference design. Used for animal + imaginary identity. */
    sameOverallDesignRead?: boolean;
    /** When set: how much silhouette/body-type drift vs reference. Used for animal + imaginary identity. */
    silhouetteDriftSeverity?: 'none' | 'mild' | 'moderate' | 'severe';
    /** Optional comic-panel source for panel-local validation/repair feedback. */
    panelNumber?: number;
    /** Optional comic-panel id for panel-local validation/repair feedback. */
    panelId?: string;
    /** Normalized 0..1000 bbox of the visible candidate on the validated image/panel. */
    characterBoundingBox?: {
      found: boolean;
      xMin: number;
      yMin: number;
      xMax: number;
      yMax: number;
      confidence: number;
      visibility: 'full_body' | 'partial_body' | 'head_only' | 'not_visible';
      /** Full-image scene QA duplicate evidence for the expected identity. */
      duplicated?: boolean;
      /** Number of visible copies of this expected identity in the whole validated image/panel. */
      duplicateCount?: number;
      /** Short location/visual notes for duplicate copies, when present. */
      duplicateNotes?: string | null;
      notes?: string | null;
    } | null;
    /** Pixel crop used for the per-character identity pass, relative to the validated image/panel. */
    characterCropRect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    } | null;
    issue?: string;
  }>;
  hasUnexpectedCharacters: boolean;
  /** Cast-audit pass output: expected roster names that are not visibly present in the image. */
  missingExpectedCharacters?: string[];
  /** Cast-audit pass output: concise notes for extra character-like subjects. */
  unexpectedCharacterNotes?: string | null;
  hasTextOrLetters: boolean;
  hasRenderingArtifacts: boolean;
  /** Optional layout QA for panel/bubble-based images, enabled only by validation request flag. */
  hasArtworkOutsidePanelBounds?: boolean;
  /** Optional layout QA for panel/bubble-based images, enabled only by validation request flag. */
  hasArtworkOverSpeechBubbles?: boolean;
  /** Optional layout QA: true when the image visually contains extra panels/sub-scenes beyond the planned panel boxes. */
  hasExtraPanelStructure?: boolean;
  /** Optional explanation for layout QA fields. */
  layoutFeedback?: string;
  overallFeedback: string; // Human-readable summary for logging
}

/**
 * Policy profile configuration for content safety
 */
export interface PolicyProfile {
  ageGroup: string;
  /** Vocabulary/syntax level; content maturity still follows ageGroup. */
  readingComplexityAgeGroup?: string;
  language: Locale;
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
  language: Locale;
  ageGroup: string;
  /** Reading complexity after applying the child profile's per-language adjustment. */
  storyComplexityAgeGroup?: string;
  /** Requested per-language adjustment (-2..+2), retained for diagnostics. */
  storyComplexityAdjustment?: number;
  childName?: string; // Optional - only set if child is a character in the story
  goal?: string;
  goalName?: string; // NEW: Translated goal name for prompts
  goalGuidance?: string; // NEW: Detailed guidance for the moral/goal (30-50 words)
  characters: CharacterData[];
  userNotes?: string;
  imageStyle?: string; // Image art style (soft_watercolor, colored_pencil, etc.)
  policyProfile: PolicyProfile;
  childProfile?: any; // Used for image generation context
  scenarioCard?: {
    // NEW: Scenario card theme
    id: string;
    name: string;
    description: string;
    promptGuidance?: string; // Binding theme guidance shared by every story in this scenario
  };
  scenarioGuidance?: string; // Randomly selected loose creative premise, not a scene outline
  worldRule?: { name: string; description: string }; // World rule for scenario (randomly selected)
  closingArtifact?: {
    id: string;
    artifactCode: string;
    title: string;
    description: string;
    imagePath: string;
  };
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
  language: Locale;
  moral: string;
  environments?: StoryEnvironment[]; // Persistent location descriptions
  mapTile?: MapTileVisual; // Board-game story reward tile brief for the whole story
  scenes: Array<{
    sceneId: number;
    setting: string;
    goal: string;
    emotion: string;
    beats: string[];
    primaryRead?: string;
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
/** Canonical wardrobe row from Director output. */
export interface StoryOutfitRow {
  id: string;
  characterName: string;
  description: string;
}

export interface EpisodeText {
  title: string;
  language: Locale;
  environments?: StoryEnvironment[]; // Persistent location descriptions
  /** Canonical wardrobe; scenes reference rows via sceneVisual.cameraComposition.characters[].outfitId (LLM) → normalized to characterOutfitIds. */
  outfits?: StoryOutfitRow[];
  mapTile?: MapTileVisual; // Board-game story reward tile brief for the whole story
  characters?: Array<{
    // NEW - optional for backward compatibility
    name: string;
    type: string;
    description: string;
    role?: string;
    personality?: string;
  }>;
  scenes: Array<{
    sceneId: number;
    text: string; // Text for this specific scene
    primaryRead?: string;
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
