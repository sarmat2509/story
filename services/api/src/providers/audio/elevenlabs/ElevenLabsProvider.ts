/**
 * ElevenLabs Audio Provider (M5 Implementation)
 * Implementation of IAudioProvider for ElevenLabs TTS
 * 
 * Features:
 * - Text-to-speech synthesis with Ukrainian language support
 * - Voice fetching and caching
 * - Prosody control (speed, stability)
 * - Retry logic with exponential backoff
 * - Error handling (rate limits, timeouts)
 */

import type {
  IAudioProvider,
  SynthesizeRequest,
  SynthesizeResult,
  Voice,
  ProsodySettings,
} from '../../base/IAudioProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

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
export class ElevenLabsProvider implements IAudioProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://api.elevenlabs.io/v1';
  private readonly model: string;
  private voiceCache: Map<string, Voice> = new Map();
  private voiceCacheExpiry: number = 0;
  private readonly voiceCacheTTL: number = 3600000; // 1 hour
  private readonly maxRetries: number = 3;
  private readonly retryDelayMs: number = 2000;

  constructor(apiKey: string, model: string = 'eleven_multilingual_v2') {
    if (!apiKey) {
      throw new Error('ElevenLabs API key is required');
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(request: SynthesizeRequest): Promise<SynthesizeResult> {
    const { text, voiceId, language, prosody, outputFormat = 'mp3' } = request;

    logger.info(
      {
        textLength: text.length,
        voiceId,
        language,
        speed: prosody?.speed,
        nightMode: prosody?.nightMode,
      },
      'Synthesizing audio with ElevenLabs'
    );

    const startTime = Date.now();

    try {
      // Map prosody settings to ElevenLabs format
      const voiceSettings = this.mapVoiceSettings(prosody);

      // Call ElevenLabs API with retry logic
      const audioBuffer = await this.retryWithBackoff(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.audio.timeoutMs);

        try {
          const response = await fetch(
            `${this.baseUrl}/text-to-speech/${voiceId}`,
            {
              method: 'POST',
              headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': this.apiKey,
              },
              body: JSON.stringify({
                text,
                model_id: this.model,
                voice_settings: voiceSettings,
              }),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            
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

      // Calculate duration (approximate based on text length and speed)
      // Average speaking rate: ~150 words per minute
      const wordCount = text.split(/\s+/).length;
      const baseSpeed = 150; // words per minute
      const speedMultiplier = prosody?.speed || 1.0;
      const durationSeconds = (wordCount / baseSpeed) * 60 / speedMultiplier;

      logger.info(
        {
          voiceId,
          textLength: text.length,
          durationSeconds,
          generationTimeMs: generationTime,
        },
        'Audio synthesized successfully'
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
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.ok;
    } catch (error) {
      logger.error({ error }, 'ElevenLabs health check failed');
      return false;
    }
  }

  /**
   * Map prosody settings to ElevenLabs voice settings
   */
  private mapVoiceSettings(
    prosody?: ProsodySettings
  ): ElevenLabsVoiceSettings {
    // Default settings for storytelling
    let stability = 0.5;
    let similarityBoost = 0.75;

    // Night mode: more stable, less variation
    if (prosody?.nightMode) {
      stability = 0.7;
      similarityBoost = 0.8;
    }

    return {
      stability,
      similarity_boost: similarityBoost,
      style: 0,
      use_speaker_boost: true,
    };
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
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Don't retry on non-retryable errors
      if (
        error.message?.includes('Invalid API key') ||
        error.message?.includes('Voice not found')
      ) {
        throw error;
      }

      // Retry on rate limits and temporary errors
      if (attempt < this.maxRetries) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        
        logger.warn(
          { attempt, maxRetries: this.maxRetries, delayMs: delay },
          'Retrying ElevenLabs request'
        );
        
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, attempt + 1);
      }

      throw error;
    }
  }
}

