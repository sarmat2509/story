import type { Locale } from '../config/languages';

// Re-export common types
export * from './common';

// Re-export type utilities
export * from './utils';

// Import for internal use
import type { ReferencePhoto, ChildProfileData } from './common';
import type { CamelizeKeys } from './utils';

// Age groups
export type AgeGroup = '1y' | '2-3' | '4-5' | '6-8' | '9-12';

// Re-export Locale from centralized config
export type { Locale };

// Story goals/themes (union type for validation)
export type StoryGoalSlug =
  | 'friendship'
  | 'kindness'
  | 'empathy'
  | 'help_parents'
  | 'independence'
  | 'courage'
  | 'sharing'
  | 'safety';

// Story Goal (complete type for API/DB)
export interface StoryGoalData {
  slug: string;
  name: string;
  description: string;
  min_age: number;
}

// Backward compatibility aliases
export type StoryGoal = StoryGoalSlug;

// Art styles
import { IMAGE_STYLES } from '../constants/imageStyles';

export type ArtStyle = typeof IMAGE_STYLES[number];

// UI theme palettes a user can pick in Profile -> Theme settings
export const THEME_PALETTE_IDS = [
  'dusk_lavender',
  'sunset_peach',
  'forest_mint',
  'ocean_breeze',
  'berry_wine',
  'vanilla_cream',
  'midnight_blue',
  'storybook_watercolor',
  'candy_pop',
  'slate_modern',
  /** Playful “boy” presets: dinosaurs, hacker/terminal, sports stadium */
  'dino_jungle',
  'cyber_hack',
  'sports_arena',
] as const;
export type ThemePaletteId = typeof THEME_PALETTE_IDS[number];
export const DEFAULT_THEME_PALETTE_ID: ThemePaletteId = 'dusk_lavender';

// User types
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_locale: Locale;
  mode?: 'instant' | 'artisan';
  onboarding_completed?: boolean;
  pseudonym?: string | null;
  about_me?: string | null;
  role: 'user' | 'admin';
  theme_palette: ThemePaletteId;
  child_mode_exit_passcode_configured?: boolean;
  child_mode_exit_passcode_set_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithOAuth extends User {
  oauth_providers: Array<{
    provider: 'google' | 'apple';
    provider_email: string | null;
  }>;
}

export interface OAuthIdentity {
  id: string;
  user_id: string;
  provider: 'google' | 'apple';
  provider_user_id: string;
  provider_email: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  device_name: string | null;
  device_type: 'ios' | 'android' | 'web' | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_active_at: string;
  expires_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expires_at: number;
  is_new_user?: boolean;
}

export interface TokenPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

// Story request
export interface StoryRequest {
  request_id: string;
  child_id: string;
  created_by_mode?: 'parent' | 'child';
  created_by_child_profile_id?: string | null;
  parent_review_required?: boolean;
  mode: 'single' | 'series';
  ui_locale: Locale;
  story_language: Locale;
  goal: StoryGoal;
  length: 'auto' | 'short' | 'medium' | 'long';
  image_style: ArtStyle;
  include_family: boolean;
  seed_elements?: {
    scenario_card_id?: string;
    user_notes?: string;
    upload_asset_ids?: string[];
  };
}

// Policy profile
export interface PolicyProfile {
  policy_version: string;
  age_group: AgeGroup;
  language: Locale;
  allowed_themes: StoryGoal[];
  disallowed: string[];
  moral_style: 'show_dont_tell' | 'explicit';
  constraints: {
    must_have_happy_ending: boolean;
    no_shaming_language: boolean;
    no_real_person_impersonation: boolean;
  };
  readability: {
    max_sentence_len: number;
    target_words_range: [number, number];
    dialog_ratio: number;
  };
}

// Episode outline
export interface EpisodeOutline {
  episode_id: string;
  language: Locale;
  title: string;
  moral: string;
  scenes: SceneOutline[];
  safety_notes: string[];
}

export interface SceneOutline {
  scene_id: number;
  setting: string;
  goal: string;
  emotion: string;
  beats: string[];
}

// Episode text
export interface EpisodeText {
  episode_id: string;
  language: Locale;
  text: string;
  scene_anchors: SceneAnchor[];
}

export interface SceneAnchor {
  scene_id: number;
  start_char: number;
  end_char: number;
}

// ==========================================
// Character Types (DB Entity)
// ==========================================

// Character Types are imported from constants
import type { CharacterType, CharacterSubtype } from '../constants/characterTypes';

// Appearance Interfaces
export interface PetAppearance {
  breed?: string;
  furColor?: string;
  furPattern?: string;
  furLength?: string;
  size?: string;
  eyeColor?: string;
  distinctiveFeatures?: string[];
}

export interface HumanAppearance {
  ageRange?: string;
  hairColor?: string;
  hairLength?: string;
  hairStyle?: string;
  eyeColor?: string;
  skinTone?: string;
  height?: string;
  build?: string;
  clothingStyle?: string;
  distinctiveFeatures?: string[];
}

export interface ImaginaryAppearance {
  species?: string;
  primaryColor?: string;
  secondaryColor?: string;
  size?: string;
  magicalFeatures?: string[];
  customDescription?: string;
}

export type AppearanceTraits = PetAppearance | HumanAppearance | ImaginaryAppearance;

// Personality Interfaces
export interface PetPersonality {
  traits?: string[];
  activities?: string[];
}

export interface HumanPersonality {
  traits?: string[];
  interests?: string[];
  fears?: string[];
}

export interface ImaginaryPersonality {
  traits?: string[];
  favoriteActivities?: string[];
}

export type PersonalityTraits = PetPersonality | HumanPersonality | ImaginaryPersonality;

// Turnaround Sheet
export interface TurnaroundSheet {
  url: string;
  frontUrl?: string; // Extracted front view for avatars/lists
  generatedAt: string;
  sourcePhotoUrl?: string;
}

// Main Character Interface (matches DB schema)
export interface Character {
  id: string;
  userId: string;
  childProfileId?: string | null;
  name: string;
  type: CharacterType; // 'person' | 'animal' | 'imaginary'
  subtype?: CharacterSubtype; // 'mother', 'dog', 'dragon', etc.
  referencePhotos?: ReferencePhoto[];
  appearanceTraits?: AppearanceTraits;
  personality?: PersonalityTraits;
  description?: string;
  aiGeneratedDescription?: string;
  clothing?: any;
  distinctiveFeatures?: string[];
  turnaroundSheet?: TurnaroundSheet;
  descriptionEn?: string;
  descriptionLanguage?: string;
  isHidden: boolean;
  descriptionEmbedding?: number[];
  createdByMode?: 'parent' | 'child';
  createdByChildProfileId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Lightweight Character (for lists, minimal data)
export interface CharacterListItem {
  id: string;
  childProfileId?: string | null;
  name: string;
  type: CharacterType;
  subtype?: CharacterSubtype;
  referencePhotos?: ReferencePhoto[];
  turnaroundSheet?: TurnaroundSheet;
  createdAt: string;
}

// Audio Alignment (M6) - Forced alignment for text-audio synchronization
export interface AlignmentCharacter {
  text: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface AlignmentWord {
  text: string;
  start: number;     // seconds
  end: number;       // seconds
  confidence?: number; // 0-1 confidence score (optional, provider-specific)
}

export interface AlignmentData {
  characters: AlignmentCharacter[];
  words: AlignmentWord[];
  averageConfidence?: number; // Average confidence score
  provider: string;           // 'elevenlabs' | 'google' | 'azure' | 'aws'
  language?: string;          // Detected language
  generatedAt: string;        // ISO timestamp
}

export interface AudioMetadata {
  voiceId: string;
  voiceName: string;
  totalDuration: number;
  generatedAt: string;
  nightMode?: boolean;
  sceneGroupAssetIds?: (string | null)[];
  finalAssetId?: string;
  provider?: string;           // Audio generation provider ('elevenlabs' | 'google' | 'openai' | 'grok' | 'azure')
  alignment?: AlignmentData;   // M6: Forced alignment data (works with audio from any provider)
}

/**
 * Contract for story.audioMetadata (DB jsonb, API response).
 * Extends success fields with error state and optional timing fields.
 */
export interface StoryAudioMetadata {
  // Success fields (present when error is false/undefined)
  voiceId?: string;
  voiceName?: string;
  totalDuration?: number;
  generatedAt?: string;
  nightMode?: boolean;
  sceneGroupAssetIds?: (string | null)[];
  finalAssetId?: string;
  provider?: string;
  alignment?: AlignmentData;

  // Error state (present when error === true)
  error?: boolean;
  errorMessage?: string;
  failedAt?: string;

  // Internal/timing (optional, used for generation metrics)
  audioGenerationTimeMs?: number;
  /** Wall time for deferred prosody LLM (audio tags), single full-story call when applicable. */
  prosodyTaggingTimeMs?: number;
  /**
   * Sum of per-chunk TTS `synthesize` durations (serial equivalent; not user wait when chunks run in parallel).
   */
  ttsChunksSynthesisTimeMs?: number;
  /** Wall clock for the whole TTS chunk loop (batches run sequentially; chunks inside a batch run in parallel). */
  ttsBatchWallTimeMs?: number;
  /**
   * Sum of wall clocks around each `Promise.all` batch (parallel within batch).
   * Close to user-visible TTS synthesize wait; slightly less than `ttsBatchWallTimeMs` if there is inter-batch overhead.
   */
  ttsSynthesisBatchesWallMs?: number;
  /**
   * Sum over batches of max(chunk synthesize ms) in that batch — lower bound if parallelism were perfect and overhead zero.
   */
  ttsChunksParallelEstimateMs?: number;
  fullTextLength?: number;
  concurrencyLimit?: number;
  numChunks?: number;

  /**
   * Deferred prosody (full story + vendor tags) persisted as soon as the prosody LLM returns,
   * before per-chunk TTS. `deferredTtsChunkCharLengths` partitions this string in order (UTF-16
   * code units); sum must equal `deferredTaggedFullText.length`.
   */
  deferredTaggedFullText?: string;
  deferredTtsChunkCharLengths?: number[];
}

// ==========================================
// Additional API/DB Types (snake_case)
// ==========================================

// Plan (subscription plan entity)
export interface Plan {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price_monthly: number;
  pricing_currency: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Plan Feature (join table)
export interface PlanFeature {
  id: string;
  plan_id: string;
  feature_id: string;
  value: any;
  created_at: string;
}

// Plan Feature Denormalized (API response format)
export interface PlanFeatureDenormalized {
  name: string;
  value: any;
  category: string;
}

// Plan with Features (API response format)
export interface PlanWithFeatures extends Plan {
  features: PlanFeatureDenormalized[];
}

// Plan Public (unauthenticated view)
export interface PlanPublic extends PlanWithFeatures {}

// Plan Authenticated (includes current subscription status)
export interface PlanAuthenticated extends PlanWithFeatures {
  is_current: boolean;
}

// Scenario Card
export interface ScenarioCard {
  id: string;
  name: string;
  description: string;
  icon?: string;
  suggested_goals: string[];
  age_groups: AgeGroup[];
}

// Voice (TTS voice entity)
export interface Voice {
  id: string;
  name: string;
  display_name: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
  preview_url?: string;
  sample_audio_url?: string;
  is_premium: boolean;
  is_locked: boolean;
  provider: string;
}

// Story Summary (lightweight for lists)
export interface StorySummary {
  id: string;
  title: string;
  language: string;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  created_by_mode?: 'parent' | 'child';
  created_by_child_profile_id?: string | null;
  parent_review_status?: 'not_required' | 'pending' | 'approved' | 'rejected';
  cover_image_url?: string;
  cover_thumbnail_url?: string;
  has_audio: boolean;
  scenario_card_id?: string;
  created_at: string;
  series_id?: string | null;
  part_number?: number | null;
}

// Story (full story entity)
export interface Story extends StorySummary {
  description?: string;
  scenes: Array<{
    id: string;
    scene_id: number;
    text: string;
    image_url?: string;
  }>;
}

// Async request status (story creation, continuation, audio generation)
export type RequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Story manifest status (entity state)
export type StoryManifestStatus = 'pending' | 'generating' | 'completed' | 'failed';

// Progress data shape for async requests (used in polling responses)
export interface StoryRequestProgressData {
  activeTasks: Array<{ task: string; progress: number; details?: Record<string, any> }>;
  completedTasks: string[];
  overallProgress: number;
  plannedTasks?: Array<{
    task: string;
    estimatedMs: number;
    rangeStart: number;
    rangeEnd: number;
  }>;
  taskTimeline?: Record<string, {
    startedAt?: number;
    completedAt?: number;
    estimatedMs?: number;
  }>;
  maxOverallProgress?: number;
}

// Story request status response (polling endpoint)
export interface StoryRequestStatusResponse {
  status: RequestStatus;
  progress: number;
  progressData?: StoryRequestProgressData;
  storyId?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
}

// ==========================================
// API Types (camelCase - auto-generated from snake_case)
// ==========================================

export type UserApi = CamelizeKeys<User>;
export type AuthResponseApi = CamelizeKeys<AuthResponse>;
export type ChildProfileApi = CamelizeKeys<ChildProfileData>;
export type PlanFeatureDenormalizedApi = CamelizeKeys<PlanFeatureDenormalized>;
export type PlanPublicApi = CamelizeKeys<PlanPublic>;
export type PlanAuthenticatedApi = CamelizeKeys<PlanAuthenticated>;
export type StoryGoalApi = CamelizeKeys<StoryGoalData>;
export type ScenarioCardApi = CamelizeKeys<ScenarioCard>;
export type VoiceApi = CamelizeKeys<Voice>;
export type StorySummaryApi = CamelizeKeys<StorySummary>;
export type StoryApi = CamelizeKeys<Story>;

/** Item from GET /api/v1/bundles (camelCase after client transform) */
export interface StoryBundleListItemApi {
  slug: string;
  name: string;
  extraStories: number;
  extraAudio: number;
  sortOrder: number;
  priceMinor: number;
  pricingCurrency: string;
  stripePriceConfigured: boolean;
}

/** GET /api/v1/me/stories/languages */
export interface UserStoryLanguagesResponse {
  status: 'success';
  languages: string[];
}

/** Story manifest from GET /api/v1/me/stories/:id - full viewer payload */
export interface StoryManifestApi extends StoryApi {
  storyId: string;
  isPublished: boolean;
  shareUrl: string | null;
  visibility: 'public' | 'unlisted' | null;
  shareCardSceneId: number | null;
  characters?: unknown[];
  audioMetadata?: StoryAudioMetadata | null;
  fullText?: string;
  scenarioCardName?: string | null;
  imageGenerationComplete?: boolean;
  sceneIdsWithImages?: number[];
  failedScenes?: Array<{ sceneId: number; errorMessage: string }>;
  seriesId?: string | null;
  partNumber?: number | null;
}
