/**
 * ElevenLabs Audio Provider (M5 Implementation)
 * Implementation of IAudioProvider for ElevenLabs Text-to-Dialogue API
 * 
 * Features:
 * - Text-to-dialogue synthesis with emotional audio tags support
 * - Ukrainian language support
 * - Voice fetching and caching
 * - Prosody control (stability, similarity_boost)
 * - Retry logic with exponential backoff
 * - Error handling (rate limits, timeouts)
 * 
 * Note: Uses text-to-dialogue endpoint which supports emotional tags like:
 * [excited], [thoughtful], [sighs], [laughing], [curious], [happy], etc.
 */

import type {
  SynthesizeRequest,
  SynthesizeResult,
  Voice,
  ProsodySettings,
  VoiceCatalogEntry,
} from '../../base/IAudioProvider';
import { BaseAudioProvider } from '../../base/BaseAudioProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { mapToneToVoiceSettings } from '../../../domain/audio/toneVoiceMapper';
import { ELEVENLABS_VOICE_CATALOG } from './voices';

/**
 * ElevenLabs API voice response
 */
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: {
    accent?: string;
    age?: string;
    gender?: string;
    use_case?: string;
    [key: string]: string | undefined;
  };
  preview_url?: string;
  available_for_tiers?: string[];
}

/**
 * ElevenLabs voice settings
 */
interface ElevenLabsVoiceSettings {
  stability: number;        // 0-1, voice consistency
  similarity_boost: number; // 0-1, voice similarity
  style?: number;          // 0-1, style exaggeration (v2 only)
  use_speaker_boost?: boolean;
}

/**
 * ElevenLabs TTS Provider
 */
export class ElevenLabsProvider extends BaseAudioProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://api.elevenlabs.io/v1';
  private readonly model: string;
  private voiceCache: Map<string, Voice> = new Map();
  private voiceCacheExpiry: number = 0;
  private readonly voiceCacheTTL: number = 3600000; // 1 hour

  constructor(apiKey: string, model: string = 'eleven_v3') {
    super();
    if (!apiKey) {
      throw new Error('ElevenLabs API key is required');
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  protected getProviderName(): string {
    return 'ElevenLabs';
  }

  protected isValidVoiceId(voiceId: string): boolean {
    // ElevenLabs voice IDs are alphanumeric strings (22 chars typically)
    return /^[a-zA-Z0-9]{20,30}$/.test(voiceId);
  }

  protected async performHealthCheck(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: { 'xi-api-key': this.apiKey },
    });
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
  }

  /**
   * Synthesize text to speech using text-to-dialogue API
   * Supports emotional audio tags like [excited], [thoughtful], [sighs]
   */
  async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
    // Validate input
    this.validateSynthesizeRequest(request);
    
    const { text, voiceId, language, prosody, outputFormat = 'mp3' } = request;

    logger.info(
      {
        textLength: text.length,
        voiceId,
        language,
        nightMode: prosody?.nightMode,
        tone: (prosody as any)?.tone,
      },
      'Synthesizing audio with ElevenLabs text-to-dialogue'
    );

    const startTime = Date.now();

    try {
      // Map prosody settings to ElevenLabs format
      const voiceSettings = this.mapVoiceSettings(prosody);

      // DEBUG: Log API request details
      logger.debug(
        {
          apiKeyPrefix: this.apiKey.substring(0, 5),
          apiKeyLength: this.apiKey.length,
          apiKeySuffix: this.apiKey.substring(this.apiKey.length - 5),
          voiceId,
          url: `${this.baseUrl}/text-to-dialogue`,
          stability: voiceSettings.stability,
          similarityBoost: voiceSettings.similarity_boost,
        },
        'About to call ElevenLabs text-to-dialogue API'
      );

      // Call ElevenLabs API with retry logic
      const audioBuffer = await this.retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.audio.timeoutMs);

        try {
          // Build text-to-dialogue request body
          const requestBody: any = {
            inputs: [
              {
                text,
                voice_id: voiceId,
              }
            ],
            model_id: this.model,
            settings: {
              stability: voiceSettings.stability,
              similarity_boost: voiceSettings.similarity_boost,
            },
          };
          
          const response = await fetch(
            `${this.baseUrl}/text-to-dialogue`,
            {
              method: 'POST',
              headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': this.apiKey,
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          // DEBUG: Log response details
          logger.debug(
            {
              status: response.status,
              statusText: response.statusText,
              contentType: response.headers.get('content-type'),
            },
            'ElevenLabs API response received'
          );

          if (!response.ok) {
            const errorText = await response.text();
            
            // DEBUG: Log full error response for 401
            if (response.status === 401) {
              logger.error(
                {
                  status: response.status,
                  errorText,
                  apiKeyPrefix: this.apiKey.substring(0, 5),
                  apiKeyLength: this.apiKey.length,
                },
                'ElevenLabs 401 error details'
              );
            }
            
            // Handle specific error cases
            if (response.status === 429) {
              throw new Error('Rate limit exceeded');
            } else if (response.status === 401) {
              throw new Error('Invalid API key');
            } else if (response.status === 404) {
              throw new Error(`Voice not found: ${voiceId}`);
            }
            
            throw new Error(
              `ElevenLabs API error: ${response.status} - ${errorText}`
            );
          }

          // Get audio buffer
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            throw new Error('ElevenLabs API timeout');
          }
          
          throw fetchError;
        }
      });

      const generationTime = Date.now() - startTime;

      // Calculate duration (approximate based on text length)
      // Average speaking rate: ~150 words per minute
      // Note: Speed parameter not supported by text-to-dialogue API
      const wordCount = text.split(/\s+/).length;
      const baseSpeed = 150; // words per minute
      const durationSeconds = (wordCount / baseSpeed) * 60;

      logger.info(
        {
          voiceId,
          textLength: text.length,
          durationSeconds,
          generationTimeMs: generationTime,
        },
        'Audio synthesized successfully with text-to-dialogue'
      );

      return {
        audioData: audioBuffer,
        mimeType: 'audio/mpeg',
        durationSeconds,
        format: 'mp3',
        metadata: {
          characterCount: text.length,
          model: this.model,
        },
      };
    } catch (error) {
      logger.error(
        { error, voiceId, textLength: text.length },
        'Audio synthesis failed'
      );
      throw error;
    }
  }

  /**
   * Get available voices
   */
  async getVoices(language?: string): Promise<Voice[]> {
    // Check cache
    if (this.voiceCacheExpiry > Date.now() && this.voiceCache.size > 0) {
      const cachedVoices = Array.from(this.voiceCache.values());
      
      if (language) {
        return cachedVoices.filter((v) => v.language === language);
      }
      
      return cachedVoices;
    }

    logger.info({ language }, 'Fetching voices from ElevenLabs');

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data = (await response.json()) as { voices: ElevenLabsVoice[] };
      
      // Map to our Voice format
      const voices: Voice[] = data.voices.map((v) => this.mapVoice(v));

      // Update cache
      this.voiceCache.clear();
      for (const voice of voices) {
        this.voiceCache.set(voice.id, voice);
      }
      this.voiceCacheExpiry = Date.now() + this.voiceCacheTTL;

      logger.info({ count: voices.length }, 'Voices fetched successfully');

      // Filter by language if requested
      if (language) {
        return voices.filter((v) => v.language === language);
      }

      return voices;
    } catch (error) {
      logger.error({ error, language }, 'Failed to fetch voices');
      throw error;
    }
  }

  /**
   * Get voice by ID
   */
  async getVoice(voiceId: string): Promise<Voice | null> {
    // Check cache first
    if (this.voiceCache.has(voiceId) && this.voiceCacheExpiry > Date.now()) {
      return this.voiceCache.get(voiceId)!;
    }

    // Refresh cache
    await this.getVoices();
    
    return this.voiceCache.get(voiceId) || null;
  }

  /**
   * Map prosody settings to ElevenLabs voice settings
   */
  private mapVoiceSettings(
    prosody?: ProsodySettings
  ): ElevenLabsVoiceSettings {
    // Get tone-based settings (if tone is provided via prosody)
    const tone = (prosody as any)?.tone;
    const nightMode = prosody?.nightMode || false;
    
    const toneSettings = mapToneToVoiceSettings(tone, nightMode);

    // Build voice settings
    const settings: ElevenLabsVoiceSettings = {
      stability: toneSettings.stability,
      similarity_boost: toneSettings.similarityBoost,
      use_speaker_boost: true,
    };

    // Add style only for v2 models (v3 doesn't support it)
    if (!this.model.includes('v3')) {
      settings.style = toneSettings.style;
    }

    return settings;
  }

  /**
   * Map ElevenLabs voice to our Voice format
   */
  private mapVoice(elevenlabsVoice: ElevenLabsVoice): Voice {
    const labels = elevenlabsVoice.labels || {};
    
    // Determine language from accent/labels
    // ElevenLabs doesn't provide explicit language, so we infer
    const language = this.inferLanguage(labels);

    return {
      id: elevenlabsVoice.voice_id,
      name: elevenlabsVoice.name,
      language,
      gender: labels.gender as 'male' | 'female' | 'neutral' | undefined,
      ageCategory: labels.age as
        | 'child'
        | 'young_adult'
        | 'adult'
        | 'senior'
        | undefined,
      accent: labels.accent,
      description: labels.use_case,
      sampleUrl: elevenlabsVoice.preview_url,
      tags: Object.keys(labels).filter((k) => k !== 'accent' && k !== 'age' && k !== 'gender'),
      isPremium: !elevenlabsVoice.available_for_tiers?.includes('free'),
    };
  }

  /**
   * Infer language from voice labels
   */
  private inferLanguage(labels: Record<string, string | undefined>): string {
    const accent = labels.accent?.toLowerCase() || '';
    
    if (accent.includes('ukrain')) return 'uk';
    if (accent.includes('russian')) return 'ru';
    if (accent.includes('spanish')) return 'es';
    if (accent.includes('american') || accent.includes('british')) return 'en';
    
    // Default to multilingual
    return 'en';
  }

  /**
   * Get default voice catalog for database seeding
   */
  getDefaultVoices(): VoiceCatalogEntry[] {
    return ELEVENLABS_VOICE_CATALOG;
  }
}

