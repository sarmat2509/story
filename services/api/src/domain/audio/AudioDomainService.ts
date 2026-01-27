/**
 * Audio Domain Service (M5 Implementation)
 * Business logic for TTS/audio generation
 * 
 * Responsibilities:
 * - Text preprocessing and normalization
 * - Voice selection and validation
 * - Cache management coordination
 * - Asset metadata creation
 * - Language-specific handling
 */

import type { IAudioProvider, Voice, SynthesizeRequest } from '../../providers/base/IAudioProvider';
import type { Story } from '../../db/schema';
import { db } from '../../db';
import { audioAssets, assets, ttsVoices } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { getTTSCacheService } from '../../services/ttsCacheService';
import { getAssetStorageService } from '../../services/assetStorageService';
import { getAudioRateLimiter } from '../../services/audioRateLimiter';
import { config } from '../../config';

/**
 * Voice parameters for audio generation
 */
export interface VoiceParams {
  voiceId?: string;       // Specific voice ID, falls back to default
  speed?: number;         // 0.5 - 2.0, default 1.0
  nightMode?: boolean;    // Enable night mode
}

/**
 * Audio generation result
 */
export interface AudioResult {
  assetId: string;
  audioUrl: string;
  duration: number;
  voiceId: string;
  voiceName: string;
  cached: boolean;
}

/**
 * AudioDomainService - Business logic for audio generation
 */
export class AudioDomainService {
  private readonly cacheService = getTTSCacheService();
  private readonly storageService = getAssetStorageService();
  private readonly rateLimiter = getAudioRateLimiter();

  constructor(private audioProvider: IAudioProvider) {}

  /**
   * Synthesize story to audio
   */
  async synthesizeStory(
    story: Story,
    voiceParams: VoiceParams,
    userPlanType?: 'free' | 'premium' // NEW: plan type for freemium logic
  ): Promise<AudioResult> {
    logger.info(
      {
        storyId: story.id,
        language: story.language,
        voiceId: voiceParams.voiceId,
        planType: userPlanType,
      },
      'Synthesizing story audio'
    );

    // Validate text length
    const textLength = story.fullText.length;
    if (textLength > config.audio.maxTextLength) {
      throw new Error(
        `Text too long: ${textLength} characters exceeds maximum ${config.audio.maxTextLength}`
      );
    }

    // Execute with rate limiting (concurrency + character quota control)
    return await this.rateLimiter.execute(async () => {
      return await this.synthesizeStoryInternal(story, voiceParams, userPlanType);
    }, textLength);
  }

  /**
   * Internal synthesis logic (wrapped by rate limiter)
   */
  private async synthesizeStoryInternal(
    story: Story,
    voiceParams: VoiceParams,
    userPlanType?: 'free' | 'premium'
  ): Promise<AudioResult> {
    // 1. Get or select voice
    const voice = await this.selectVoiceForStory(
      story,
      voiceParams.voiceId,
      userPlanType
    );

    if (!voice) {
      throw new Error(
        `No voice available for language: ${story.language}`
      );
    }

    // 2. Normalize text
    const normalizedText = this.normalizeText(story.fullText, story.language);

    // 3. Check cache
    const speed = voiceParams.speed || 1.0;
    const cachedAudio = await this.cacheService.checkCache(
      normalizedText,
      voice.id,
      speed
    );

    if (cachedAudio) {
      logger.info(
        { storyId: story.id, voiceId: voice.id },
        'Using cached audio'
      );

      return {
        assetId: cachedAudio.assetId,
        audioUrl: cachedAudio.audioUrl,
        duration: cachedAudio.duration,
        voiceId: voice.id,
        voiceName: voice.name,
        cached: true,
      };
    }

    // 4. Generate audio via provider
    const synthesizeRequest: SynthesizeRequest = {
      text: normalizedText,
      voiceId: voice.id,
      language: story.language,
      prosody: {
        speed,
        nightMode: voiceParams.nightMode,
      },
      outputFormat: 'mp3',
    };

    const result = await this.audioProvider.synthesize(synthesizeRequest);

    // 5. Upload to storage
    const storageResult = await this.storageService.uploadAsset({
      buffer: result.audioData,
      mimeType: result.mimeType,
      assetType: 'audio',
      storyId: story.id,
      metadata: {
        voiceId: voice.id,
        voiceName: voice.name,
        language: story.language,
        duration: result.durationSeconds,
        ...result.metadata,
      },
    });

    // 6. Create audio_asset record
    const textHash = this.cacheService.generateTextHash(normalizedText);

    const [audioAsset] = await db
      .insert(audioAssets)
      .values({
        storyId: story.id,
        voiceId: voice.id,
        voiceName: voice.name,
        language: story.language,
        speed: speed.toString() as any,
        pitchShift: 0,
        nightMode: voiceParams.nightMode || false,
        textHash,
        assetId: storageResult.id,
        durationSeconds: result.durationSeconds.toString() as any,
        provider: 'elevenlabs',
        providerRequestId: result.providerRequestId,
        status: 'completed',
      })
      .returning();

    logger.info(
      {
        storyId: story.id,
        audioAssetId: audioAsset.id,
        duration: result.durationSeconds,
      },
      'Audio synthesized and stored'
    );

    return {
      assetId: storageResult.id,
      audioUrl: storageResult.url,
      duration: result.durationSeconds,
      voiceId: voice.id,
      voiceName: voice.name,
      cached: false,
    };
  }

  /**
   * Get available voices for language
   */
  async getAvailableVoices(language: string): Promise<Voice[]> {
    logger.debug({ language }, 'Fetching available voices');

    // Fetch from provider
    const voices = await this.audioProvider.getVoices(language);

    // Filter to active voices only
    return voices.filter((v) => v.language === language);
  }

  /**
   * Regenerate audio with different voice
   */
  async regenerateAudio(
    storyId: string,
    newVoiceId?: string
  ): Promise<AudioResult> {
    logger.info({ storyId, newVoiceId }, 'Regenerating audio');

    // Load story
    const [story] = await db
      .select()
      .from(db.stories)
      .where(eq(db.stories.id, storyId))
      .limit(1);

    if (!story) {
      throw new Error('Story not found');
    }

    // Invalidate old cache (optional - we keep old audio)
    // await this.cacheService.invalidateCache(storyId);

    // Generate with new voice
    return await this.synthesizeStory(story, { voiceId: newVoiceId });
  }

  /**
   * Select voice for story based on plan type
   */
  private async selectVoiceForStory(
    story: Story,
    explicitVoiceId: string | undefined,
    userPlanType?: 'free' | 'premium'
  ): Promise<Voice | null> {
    // If explicit voice ID provided, use it
    if (explicitVoiceId) {
      const voice = await this.audioProvider.getVoice(explicitVoiceId);
      
      if (voice && voice.language === story.language) {
        logger.info({ voiceId: explicitVoiceId }, 'Using explicit voice');
        return voice;
      }
      
      logger.warn(
        { voiceId: explicitVoiceId, language: story.language },
        'Explicit voice not found or language mismatch, using automatic selection'
      );
    }

    // Check plan type (default to free)
    const isPremium = userPlanType === 'premium';
    
    // For now: both free and premium use single narrator voice
    // M6+ will implement multi-voice for premium
    const narratorVoice = await this.selectVoiceForRole(
      story.language,
      'narrator',
      undefined,
      story.ageGroupId || undefined
    );

    if (!narratorVoice) {
      logger.error({ language: story.language }, 'No narrator voice found');
      return null;
    }

    logger.info(
      { 
        voiceId: narratorVoice.id, 
        voiceName: narratorVoice.name,
        planType: userPlanType 
      },
      'Narrator voice selected'
    );

    return narratorVoice;
  }

  /**
   * Select voice for a specific role (narrator or character)
   * Uses voice catalog with age group filtering
   */
  private async selectVoiceForRole(
    language: string,
    role: 'narrator' | 'character',
    characterGender?: 'male' | 'female' | 'neutral',
    ageGroupId?: string
  ): Promise<Voice | null> {
    const { ttsVoices, voiceAgeGroups } = await import('../../db/schema');
    const { eq, and, or, inArray } = await import('drizzle-orm');
    
    logger.debug({ language, role, gender: characterGender, ageGroupId }, 'Selecting voice for role');
    
    // Build base filters
    const filters = [
      eq(ttsVoices.language, language),
      eq(ttsVoices.isActive, true),
    ];
    
    // Role type: must support the requested role
    filters.push(
      or(
        eq(ttsVoices.roleType, role),
        eq(ttsVoices.roleType, 'both')
      )!
    );
    
    // Gender match for characters
    if (role === 'character' && characterGender) {
      filters.push(eq(ttsVoices.gender, characterGender));
    }
    
    // Query with optional age group filtering
    let query = db
      .select({
        id: ttsVoices.id,
        providerVoiceId: ttsVoices.providerVoiceId,
        name: ttsVoices.name,
        language: ttsVoices.language,
        gender: ttsVoices.gender,
        ageCategory: ttsVoices.ageCategory,
        voiceTags: ttsVoices.voiceTags,
        description: ttsVoices.description,
        providerPreviewUrl: ttsVoices.providerPreviewUrl,
        isPremium: ttsVoices.isPremium,
        roleType: ttsVoices.roleType,
      })
      .from(ttsVoices);
    
    // If age group specified, join with voice_age_groups
    if (ageGroupId) {
      query = query
        .innerJoin(voiceAgeGroups, eq(voiceAgeGroups.voiceId, ttsVoices.id))
        .where(and(
          ...filters,
          eq(voiceAgeGroups.ageGroupId, ageGroupId)
        )) as any;
    } else {
      query = query.where(and(...filters)) as any;
    }
    
    const voices = await query;
    
    if (voices.length === 0) {
      logger.warn(
        { language, role, gender: characterGender, ageGroupId }, 
        'No voices found with filters, trying fallback'
      );
      
      // Fallback: any active voice for language (ignore age group)
      const fallback = await db
        .select()
        .from(ttsVoices)
        .where(and(
          eq(ttsVoices.language, language),
          eq(ttsVoices.isActive, true)
        ))
        .limit(1);
      
      if (fallback.length === 0) {
        return null;
      }
      
      return this.mapDbVoiceToProvider(fallback[0]);
    }
    
    // Prefer non-premium voices
    const freeVoices = voices.filter(v => !v.isPremium);
    const selectedDb = freeVoices.length > 0 ? freeVoices[0] : voices[0];
    
    logger.info({ 
      voiceId: selectedDb.id, 
      voiceName: selectedDb.name,
      role,
      gender: characterGender 
    }, 'Voice selected for role');
    
    return this.mapDbVoiceToProvider(selectedDb);
  }

  /**
   * Map DB voice record to Voice interface
   */
  private mapDbVoiceToProvider(dbVoice: any): Voice {
    return {
      id: dbVoice.providerVoiceId,
      name: dbVoice.name,
      language: dbVoice.language,
      gender: dbVoice.gender as 'male' | 'female' | 'neutral' | undefined,
      ageCategory: dbVoice.ageCategory as 'child' | 'young_adult' | 'adult' | 'senior' | undefined,
      tags: dbVoice.voiceTags || [],
      description: dbVoice.description,
      sampleUrl: dbVoice.providerPreviewUrl || dbVoice.sampleAudioUrl,
      isPremium: dbVoice.isPremium,
    };
  }

  /**
   * Select voice for generation (DEPRECATED - use selectVoiceForStory)
   */
  private async selectVoice(
    voiceId: string | undefined,
    language: string
  ): Promise<Voice | null> {
    // If voice ID provided, use it
    if (voiceId) {
      const voice = await this.audioProvider.getVoice(voiceId);
      
      if (voice && voice.language === language) {
        return voice;
      }
      
      logger.warn(
        { voiceId, language },
        'Requested voice not found or language mismatch, using default'
      );
    }

    // Get default voice for language
    const voices = await this.audioProvider.getVoices(language);

    if (voices.length === 0) {
      logger.error({ language }, 'No voices available for language');
      return null;
    }

    // Prefer non-premium voices for free users
    const freeVoices = voices.filter((v) => !v.isPremium);
    
    if (freeVoices.length > 0) {
      return freeVoices[0];
    }

    // Fallback to any voice
    return voices[0];
  }

  /**
   * Normalize text for synthesis
   */
  private normalizeText(text: string, language: string): string {
    let normalized = text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\u2019/g, "'") // Normalize apostrophes
      .replace(/\u201c|\u201d/g, '"') // Normalize quotes
      .replace(/\u2026/g, '...'); // Normalize ellipsis

    // Language-specific normalization
    if (language === 'uk') {
      // Ukrainian-specific normalization if needed
      normalized = normalized.replace(/ʼ/g, "'");
    }

    return normalized;
  }
}

