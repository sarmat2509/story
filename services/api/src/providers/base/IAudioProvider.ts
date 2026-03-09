/**
 * Provider-agnostic Audio/TTS Generation Interface
 * Abstracts TTS providers (ElevenLabs, Google Cloud TTS, Azure TTS, etc.)
 * 
 * M5: Full implementation for audio generation
 */

/**
 * Voice metadata
 */
export interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral'; // Updated to include 'neutral'
  provider?: 'elevenlabs' | 'google' | 'openai'; // NEW: Provider type
  ageCategory?: 'child' | 'young_adult' | 'adult' | 'senior';
  tags?: string[];        // e.g., ['calm', 'energetic', 'storyteller', 'parent']
  accent?: string;
  description?: string;
  sampleUrl?: string;
  isPremium?: boolean;
  dbId?: string; // Database UUID (for caching)
}

/**
 * Voice catalog entry for seeding database
 * Used by getDefaultVoices() method
 */
export interface VoiceCatalogEntry {
  providerVoiceId: string;
  name: string;              // Backend DB name: "cassiopeia", "orion"
  displayName: string;       // Frontend display: "Кассіопея", "Оріон"
  language: string;
  gender: 'male' | 'female';
  ageCategory: 'child' | 'young_adult' | 'adult' | 'senior';
  roleType: 'narrator' | 'character' | 'both';
  voiceTags: string[];
  description: string;
  providerPreviewUrl?: string;
  isPremium: boolean;
  suitableForAgeSlugs: string[];
}

/**
 * Prosody settings for speech control
 */
export interface ProsodySettings {
  speed?: number;         // 0.5 - 2.0, default 1.0
  pitchShift?: number;    // -10 to +10 semitones
  nightMode?: boolean;    // Softer, slower for bedtime
  tone?: string | null;   // Story tone (calm, adventure, humor, lullaby, educational)
}

/**
 * Audio synthesis request
 */
export interface SynthesizeRequest {
  text: string;
  voiceId: string;
  language: string;       // Required: 'uk', 'en', 'ru', etc.
  prosody?: ProsodySettings;
  outputFormat?: 'mp3' | 'wav' | 'ogg';
}

/**
 * Audio synthesis result
 */
export interface SynthesizeResult {
  audioData: Buffer;      // Raw audio data
  mimeType: string;       // e.g., 'audio/mpeg' for mp3
  durationSeconds: number;
  format: 'mp3' | 'wav' | 'ogg';
  providerRequestId?: string;  // External API request ID for tracking
  metadata?: {
    characterCount: number;
    model?: string;
  };
}

/**
 * IAudioProvider - Provider-agnostic interface for TTS/audio generation
 * 
 * M5 MVP: ElevenLabsProvider (ElevenLabs TTS)
 * Future: GoogleTTSProvider, AzureTTSProvider, OpenAITTSProvider
 * 
 * Domain Services work ONLY with this interface, never with specific providers.
 */
export interface IAudioProvider {
  /**
   * Synthesize text to speech
   * @param request - Provider-agnostic synthesis request
   * @returns Audio data buffer with metadata
   */
  synthesize(request: SynthesizeRequest): Promise<SynthesizeResult>;

  /**
   * Get available voices
   * @param language - Filter by language (optional)
   * @returns Array of available voices
   */
  getVoices(language?: string): Promise<Voice[]>;

  /**
   * Get voice by ID
   * @param voiceId - Voice identifier
   * @returns Voice metadata or null if not found
   */
  getVoice(voiceId: string): Promise<Voice | null>;

  /**
   * Test method for provider health check
   * @returns True if provider is healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get default voice catalog for seeding database
   * Each provider exports its own curated list of voices
   * @returns Array of voice catalog entries
   */
  getDefaultVoices(): VoiceCatalogEntry[];

  /**
   * Max characters per chunk for scene grouping.
   * Google TTS: 4000 bytes limit → ~2000 chars (UTF-8).
   * ElevenLabs/OpenAI: 4500/4096 chars.
   */
  getMaxCharsPerChunk(): number;

  /**
   * Max concurrent synthesis requests.
   * ElevenLabs uses planSlug; Google/OpenAI ignore and return fixed limit.
   */
  getMaxConcurrency(planSlug?: string): number;
}
