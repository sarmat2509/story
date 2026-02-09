import type { Locale } from '../config/languages';

// Re-export common types
export * from './common';

// Age groups
export type AgeGroup = '1y' | '2-3' | '4-5' | '6-8' | '9-12';

// Re-export Locale from centralized config
export type { Locale };

// Story goals/themes
export type StoryGoal =
  | 'friendship'
  | 'kindness'
  | 'empathy'
  | 'help_parents'
  | 'independence'
  | 'courage'
  | 'sharing'
  | 'safety';

// Story tone
export type StoryTone = 'calm' | 'adventure' | 'humor' | 'lullaby' | 'educational';

// Art styles
import { IMAGE_STYLES } from '../constants/imageStyles';

export type ArtStyle = typeof IMAGE_STYLES[number];

// User types
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_locale: Locale;
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

export interface SessionListItem {
  id: string;
  device_name: string | null;
  device_type: 'ios' | 'android' | 'web' | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
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

// User preferences
export interface UserPreferences {
  user_id: string;
  preferred_locale: Locale;
  ui_locale: Locale;
  default_story_language: Locale;
  allow_language_override: boolean;
  timezone: string;
}

// Child profile
export interface ChildProfile {
  child_id: string;
  name: string;
  age_months: number;
  age_group: AgeGroup;
  language: Locale;
  interests: string[];
  sensitivities: {
    fear: 'none' | 'low' | 'medium';
    avoid_topics: string[];
  };
  family_cast?: {
    mom_name?: string;
    dad_name?: string;
  };
  pet?: {
    type: string;
    name: string;
  };
}

// Story request
export interface StoryRequest {
  request_id: string;
  child_id: string;
  mode: 'single' | 'series';
  ui_locale: Locale;
  story_language: Locale;
  goal: StoryGoal;
  tone: StoryTone;
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
  fear_level_max: number;
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

// Character sheet
export interface CharacterSheet {
  character_id: string;
  name: string;
  role: 'protagonist' | 'companion' | 'helper' | 'family';
  canonical_description: string;
  do_not_change: string[];
  reference_image_ids: string[];
}

// Illustration plan
export interface IllustrationPlan {
  episode_id: string;
  language: Locale;
  style: ArtStyle;
  image_quality: 'low' | 'medium' | 'high';
  scenes: SceneIllustration[];
}

export interface SceneIllustration {
  scene_id: number;
  prompt: string;
  negative: string;
  references: {
    characters: string[];
    input_images: string[];
  };
  composition?: {
    control: 'sketch' | 'pose' | 'depth';
    guidance: 'low' | 'medium' | 'high';
  };
  output: {
    aspect: string;
    size: string;
  };
}

// TTS plan
export interface TTSPlan {
  episode_id: string;
  language: Locale;
  voice: {
    provider: string;
    voice_id: string;
  };
  prosody: {
    speed: number;
    pauses: 'gentle' | 'normal' | 'rapid';
    night_mode: boolean;
  };
  chapters: TTSChapter[];
}

export interface TTSChapter {
  scene_id: number;
  text_ref: {
    start: number;
    end: number;
  };
}

// Series bible
export interface SeriesBible {
  series_id: string;
  child_id: string;
  language: Locale;
  ui_locale: Locale;
  theme_arc: string;
  characters: string[];
  world_rules: string[];
  forbidden_repeats: {
    plot_twists: string[];
    morals: string[];
    settings: string[];
  };
  safety_profile: AgeGroup;
  style: ArtStyle;
}

// Season arc
export interface SeasonArc {
  series_id: string;
  language: Locale;
  episodes: EpisodeArc[];
  finale: {
    ep: number;
    must_close: string[];
    ending: string;
  };
}

export interface EpisodeArc {
  ep: number;
  goal: string;
  unique_hook: string;
  cliffhanger?: string;
}

// Continuity state
export interface ContinuityState {
  series_id: string;
  language: Locale;
  current_ep: number;
  facts: string[];
  open_threads: string[];
  used_morals: string[];
  used_hooks: string[];
  embedding_fingerprints: string[];
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
  provider?: string;           // Audio generation provider ('elevenlabs' | 'google' | 'openai' | 'azure')
  alignment?: AlignmentData;   // M6: Forced alignment data (works with audio from any provider)
}
