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
import type { IAlignmentProvider, AlignmentResult } from '../../providers/base/IAlignmentProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';

export interface AudioDomainOptions {
  onUsage?: (usage: UsageMetadata) => void;
}
import type { Story } from '../../db/schema';
import type { AudioMetadata, StoryAudioMetadata } from '@wondertales/shared';
import { getAssetRepository, getVoiceRepository, getStoryRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import { getTTSCacheService } from '../../services/ttsCacheService';
import { getAssetStorageService } from '../../services/assetStorageService';
import { getAudioRateLimiter } from '../../services/audioRateLimiter';
import { config } from '../../config';
import { ElevenLabsProvider } from '../../providers/audio/elevenlabs/ElevenLabsProvider';

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
 * AudioDomainService - Business logic for audio generation and alignment
 * M6: Added forced alignment generation support
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
    userPlanType?: 'free' | 'premium', // NEW: plan type for freemium logic
    options?: AudioDomainOptions
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

    // Execute with rate limiting (concurrency + character quota control)
    const textLength = story.fullText.length;
    return await this.rateLimiter.execute(async () => {
      return await this.synthesizeStoryInternal(story, voiceParams, userPlanType, options);
    }, textLength);
  }

  /**
   * Synthesize story from scene groups (M5+ with parallel generation)
   * 
   * Handles stories of any length by grouping scenes optimally and generating
   * multiple groups in parallel based on user's plan concurrency limit.
   * 
   * @param story - Story metadata
   * @param sceneGroups - Pre-grouped scenes optimized for parallel generation
   * @param voiceParams - Voice parameters (voiceId, speed, nightMode)
   * @param userPlanType - User's plan type for voice selection
   * @param concurrencyLimit - Max concurrent API requests allowed by user's plan
   * @returns Audio result with assetId, URL, duration
   */
  async synthesizeSceneGroups(
    story: Story,
    sceneGroups: Array<{ scenes: any[]; text: string; totalChars: number }>,
    voiceParams: VoiceParams,
    userPlanType?: 'free' | 'premium',
    concurrencyLimit: number = 2,
    options?: AudioDomainOptions
  ): Promise<AudioResult> {
    // 1. Select voice FIRST to determine provider
    logger.info({ storyId: story.id }, 'Step 1/7: Selecting voice');
    const voice = await this.selectVoiceForStory(
      story,
      voiceParams.voiceId,
      userPlanType
    );

    if (!voice) {
      throw new Error(`No voice available for language: ${story.language}`);
    }

    logger.info(
      {
        storyId: story.id,
        voiceId: voice.id,
        voiceName: voice.name,
        voiceGender: voice.gender,
        provider: voice.provider,
      },
      'Voice selected'
    );
    
    // 2. Get provider based on voice.provider
    const { getAudioProviderByName } = await import('../../services/aiService');
    const audioProvider = getAudioProviderByName(voice.provider || 'elevenlabs');
    
    logger.info(
      {
        storyId: story.id,
        provider: voice.provider,
        providerType: audioProvider.constructor.name,
      },
      'Audio provider selected for voice'
    );
    
    // Log provider info for debugging
    logger.debug(
      {
        providerType: audioProvider.constructor.name,
        provider: voice.provider,
      },
      'Provider state before synthesis'
    );

    logger.info(
      {
        storyId: story.id,
        totalGroups: sceneGroups.length,
        concurrencyLimit,
        voiceParams,
      },
      '=== Starting audio generation ==='
    );

    logger.info(
      {
        storyId: story.id,
        numGroups: sceneGroups.length,
        totalChars: sceneGroups.reduce((sum, g) => sum + g.totalChars, 0),
        voiceId: voiceParams.voiceId,
        planType: userPlanType,
      },
      'Synthesizing story from scene groups'
    );

    // 2. Build full text for cache key
    const fullText = sceneGroups.map((g) => g.text).join(' ');
    const speed = voiceParams.speed || 1.0;

    // 3. Check cache
    logger.info({ storyId: story.id }, 'Step 2/7: Checking full audio cache');
    const cachedAudio = await this.cacheService.checkCache(
      fullText,
      (voice as any).dbId || voice.id, // Use DB UUID for cache
      speed
    );

    if (cachedAudio) {
      logger.info(
        { storyId: story.id, voiceId: voice.id, assetId: cachedAudio.assetId },
        '✅ Full audio found in cache - skipping generation'
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

    // NEW: Load existing scene group assets from metadata (M5.1)
    logger.info({ storyId: story.id }, 'Step 3/7: Checking for existing partial chunks');
    const existingAssets = await this.loadExistingSceneGroupAssets(story, sceneGroups);
    
    const audioMetadata: StoryAudioMetadata = (story.audioMetadata as StoryAudioMetadata | null) ?? {};
    const sceneGroupAssetIds = audioMetadata.sceneGroupAssetIds ?? new Array(sceneGroups.length).fill(null);
    
    // Ensure array has correct length (in case story was regenerated with different scene count)
    while (sceneGroupAssetIds.length < sceneGroups.length) {
      sceneGroupAssetIds.push(null);
    }

    logger.info(
      {
        storyId: story.id,
        totalGroups: sceneGroups.length,
        cachedGroups: existingAssets.filter(Boolean).length,
        missingGroups: existingAssets.filter(a => !a).length,
      },
      'Existing chunks loaded - will REUSE cached, generate only missing'
    );

    // 4. Generate only missing groups in batches (respect concurrency limit)
    logger.info({ storyId: story.id }, 'Step 4/7: Generating missing audio chunks');
    logger.info(
      {
        storyId: story.id,
        numGroups: sceneGroups.length,
        cachedGroups: existingAssets.filter(a => a !== null).length,
        concurrencyLimit,
        voiceId: voice.id,
      },
      'Starting batched audio generation for scene groups'
    );

    const startTime = Date.now();
    const audioResults: Array<{
      audioData: Buffer;
      durationSeconds: number;
      assetId?: string;
      cached?: boolean;
    }> = [];

    // Process groups in batches
    for (let i = 0; i < sceneGroups.length; i += concurrencyLimit) {
      const batch = sceneGroups.slice(i, i + concurrencyLimit);
      
      logger.info(
        {
          storyId: story.id,
          batchIndex: Math.floor(i / concurrencyLimit),
          batchSize: batch.length,
          groupIndices: `${i}-${i + batch.length - 1}`,
        },
        'Processing batch'
      );

      const batchResults = await Promise.all(
        batch.map(async (group, batchIndex) => {
          const absoluteIndex = i + batchIndex;
          
          // NEW: Check if we already have this group cached
          const existingBuffer = existingAssets[absoluteIndex];
          if (existingBuffer) {
            logger.info(
              {
                storyId: story.id,
                groupIndex: absoluteIndex,
                cacheHit: true,
                assetId: sceneGroupAssetIds[absoluteIndex],
              },
              '✅ Using cached chunk - skipping generation'
            );
            
            return {
              audioData: existingBuffer,
              durationSeconds: 0, // We'll calculate from metadata if needed
              cached: true,
              assetId: sceneGroupAssetIds[absoluteIndex],
            };
          }
          
          // ✅ NEW: Retry logic (max 3 attempts with exponential backoff)
          let lastError: Error | null = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              logger.info(
                {
                  storyId: story.id,
                  groupIndex: absoluteIndex,
                  attempt,
                  maxAttempts: 3,
                  sceneIds: group.scenes.map((s) => s.sceneId),
                  chars: group.totalChars,
                },
                `🔄 Generating chunk ${absoluteIndex} (attempt ${attempt}/3)`
              );

              const startTime = Date.now();
              const result = await audioProvider.synthesize({
                text: group.text,
                voiceId: voice.id,
                language: story.language,
                prosody: {
                  speed,
                  nightMode: voiceParams.nightMode,
                },
                outputFormat: 'mp3',
              });
              const generationTime = Date.now() - startTime;

              if (options?.onUsage) {
                this.reportAudioUsage(options.onUsage, voice, group.text.length, result.durationSeconds);
              }

              logger.info(
                {
                  storyId: story.id,
                  groupIndex: absoluteIndex,
                  duration: result.durationSeconds,
                  size: result.audioData.length,
                  generationTimeMs: generationTime,
                  attempt,
                },
                '✅ Audio synthesized from ElevenLabs'
              );

              // Save partial
              const partialAssetId = await this.savePartialSceneGroupAudio(
                story,
                absoluteIndex,
                result.audioData,
                result.durationSeconds,
                (voice as any).dbId || voice.id,
                speed,
                voice
              );
              
              logger.info(
                {
                  storyId: story.id,
                  groupIndex: absoluteIndex,
                  assetId: partialAssetId,
                },
                '💾 Partial chunk saved to storage and DB'
              );
              
              // Update metadata
              sceneGroupAssetIds[absoluteIndex] = partialAssetId;
              await this.updateStoryAudioMetadata(story.id, {
                ...audioMetadata,
                voiceId: voice.id,
                voiceName: voice.name,
                sceneGroupAssetIds,
              });

              logger.info(
                {
                  storyId: story.id,
                  groupIndex: absoluteIndex,
                  assetId: partialAssetId,
                  attempt,
                },
                '✅ Chunk generation successful'
              );

              return {
                ...result,
                assetId: partialAssetId,
              };
            } catch (error) {
              lastError = error as Error;
              
              if (attempt < 3) {
                const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                logger.warn(
                  {
                    storyId: story.id,
                    groupIndex: absoluteIndex,
                    attempt,
                    error: (error as Error).message,
                    retryAfterMs: backoffMs,
                  },
                  `⚠️  Chunk generation failed, retrying after ${backoffMs}ms...`
                );
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, backoffMs));
              } else {
                logger.error(
                  {
                    storyId: story.id,
                    groupIndex: absoluteIndex,
                    error: (error as Error).message,
                    stack: (error as Error).stack,
                  },
                  '❌ Chunk generation failed after 3 attempts'
                );
              }
            }
          }
          
          // ✅ If all retries failed, throw error
          throw new Error(
            `Failed to generate scene group ${absoluteIndex} after 3 attempts: ${lastError?.message}`
          );
        })
      );

      audioResults.push(...batchResults);
      
      logger.info(
        {
          storyId: story.id,
          completedGroups: audioResults.length,
          totalGroups: sceneGroups.length,
        },
        'Batch completed'
      );
    }

    const generationTime = Date.now() - startTime;

    // 5. Extract buffers and calculate estimated duration from chunks
    logger.info({ storyId: story.id }, 'Step 5/7: Extracting audio buffers from results');
    const audioBuffers = audioResults.map((r) => r.audioData);
    let totalDuration = audioResults.reduce(
      (sum, r) => sum + r.durationSeconds,
      0
    );

    logger.info(
      {
        storyId: story.id,
        numChunks: audioBuffers.length,
        totalSize: audioBuffers.reduce((sum, buf) => sum + buf.length, 0),
        estimatedDuration: totalDuration,
        generationTimeMs: generationTime,
      },
      'Audio buffers extracted'
    );

    // 6. Concatenate if multiple groups (always use concatenator to get actual duration)
    logger.info({ storyId: story.id }, 'Step 6/7: Concatenating audio chunks');
    let finalAudioData: Buffer;

    if (audioBuffers.length === 1) {
      logger.info({ storyId: story.id }, 'Single buffer - probing duration');
      // Even for single buffer, probe duration for accuracy
      const { concatenateAudioBuffers } = await import('./audioConcatenator');
      const { buffer, durationSeconds } = await concatenateAudioBuffers(audioBuffers);
      finalAudioData = buffer;
      totalDuration = durationSeconds; // Use actual duration
      logger.info({ 
        storyId: story.id, 
        actualDuration: durationSeconds,
        size: buffer.length,
        estimatedWas: audioResults[0].durationSeconds 
      }, '✅ Single buffer duration probed');
    } else {
      logger.info(
        { storyId: story.id, numChunks: audioBuffers.length },
        'Multiple buffers - concatenating with FFmpeg'
      );

      const { concatenateAudioBuffers } = await import('./audioConcatenator');
      const { buffer, durationSeconds } = await concatenateAudioBuffers(audioBuffers);
      finalAudioData = buffer;
      totalDuration = durationSeconds; // Use actual duration from concatenated file

      logger.info(
        {
          storyId: story.id,
          finalSize: finalAudioData.length,
          actualDuration: durationSeconds,
          bufferCount: audioBuffers.length,
        },
        '✅ Audio concatenation complete'
      );
    }

    // 7. Upload to storage
    logger.info({ storyId: story.id }, 'Step 7/7: Uploading final audio to storage');
    const uploadResult = await this.storageService.uploadAsset({
      data: finalAudioData,
      mimeType: 'audio/mpeg',
      userId: story.userId,
      storyId: story.id,
      assetType: 'audio',
    });
    
    logger.info(
      {
        storyId: story.id,
        storagePath: uploadResult.storagePath,
        size: finalAudioData.length,
      },
      '✅ Final audio uploaded'
    );

    // 8. Create assets table record
    logger.info({ storyId: story.id }, 'Step 8/8: Saving final audio record to DB');
    const assetRecord = await getAssetRepository().create({
      storyId: story.id,
      sceneId: null,
      assetType: 'audio',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: 'audio/mpeg',
      fileSizeBytes: finalAudioData.length,
      generationParams: {
        voiceId: voice.id,
        voiceName: voice.name,
        language: story.language,
        numGroups: sceneGroups.length,
        duration: totalDuration,
      },
      status: 'completed',
    });

    // 9. Create audio_assets record (TTS metadata)
    await getAssetRepository().createAudioAssetIgnoreConflict({
        storyId: story.id,
        assetId: assetRecord.id,
        voiceId: (voice as any).dbId || null, // Use DB UUID for cache
        voiceName: voice.name,
        language: story.language,
        speed: speed.toString() as any,
        pitchShift: 0,
        nightMode: false,
        textHash: this.cacheService.generateTextHash(fullText),
        durationSeconds: totalDuration.toString() as any,
        provider: voice.provider || 'elevenlabs', // Use voice provider, not hardcoded
        status: 'completed',
        sceneGroupIndex: null, // ✅ NULL = final concatenated audio
        isFinal: true, // ✅ Explicitly mark as final
        retryCount: 0,
      });

    // 11. Update story metadata with final concatenated asset ID (M5.1)
    await this.updateStoryAudioMetadata(story.id, {
      ...audioMetadata,
      voiceId: voice.id,
      voiceName: voice.name,
      totalDuration,
      generatedAt: new Date().toISOString(),
      sceneGroupAssetIds, // Keep partial assets for retry
      finalAssetId: assetRecord.id, // Final concatenated audio
    });

    logger.info(
      {
        storyId: story.id,
        assetId: assetRecord.id,
        duration: totalDuration,
        finalSize: finalAudioData.length,
        cachedGroups: existingAssets.filter(Boolean).length,
        generatedGroups: audioResults.filter(r => !r.cached).length,
        totalGroups: sceneGroups.length,
      },
      '=== ✅ Audio generation completed successfully ==='
    );

    return {
      assetId: assetRecord.id,
      audioUrl: assetRecord.storageUrl || assetRecord.signedUrl || '',
      duration: totalDuration,
      voiceId: voice.id,
      voiceName: voice.name,
      cached: false,
    };
  }

  /**
   * Internal synthesis logic (wrapped by rate limiter)
   */
  private async synthesizeStoryInternal(
    story: Story,
    voiceParams: VoiceParams,
    userPlanType?: 'free' | 'premium',
    options?: AudioDomainOptions
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
      (voice as any).dbId || voice.id, // Use DB UUID for cache
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

    if (options?.onUsage) {
      this.reportAudioUsage(options.onUsage, voice, normalizedText.length, result.durationSeconds);
    }

    // 5. Upload to storage
    const uploadResult = await this.storageService.uploadAsset({
      data: result.audioData,
      mimeType: result.mimeType,
      userId: story.userId,
      storyId: story.id,
      assetType: 'audio',
    });

    // 6. Create assets table record
    const assetRecord = await getAssetRepository().create({
      storyId: story.id,
      sceneId: null,
      assetType: 'audio',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: result.mimeType,
      fileSizeBytes: result.audioData.length,
      generationParams: {
        voiceId: voice.id,
        voiceName: voice.name,
        language: story.language,
        duration: result.durationSeconds,
        ...result.metadata,
      },
      status: 'completed',
    });

    // 7. Create audio_asset record
    const textHash = this.cacheService.generateTextHash(normalizedText);

    const audioAsset = await getAssetRepository().createAudioAsset({
        storyId: story.id,
        assetId: assetRecord.id,
        voiceId: (voice as any).dbId || null, // Use DB UUID for cache
        voiceName: voice.name,
        language: story.language,
        speed: speed.toString() as any,
        pitchShift: 0,
        nightMode: voiceParams.nightMode || false,
        textHash,
        durationSeconds: result.durationSeconds.toString() as any,
        provider: 'elevenlabs',
        providerRequestId: result.providerRequestId,
        status: 'completed',
      });

    logger.info(
      {
        storyId: story.id,
        audioAssetId: audioAsset.id,
        duration: result.durationSeconds,
      },
      'Audio synthesized and stored'
    );

    return {
      assetId: assetRecord.id,
      audioUrl: assetRecord.storageUrl || assetRecord.signedUrl || '',
      duration: result.durationSeconds,
      voiceId: voice.id,
      voiceName: voice.name,
      cached: false,
    };
  }

  /**
   * Report audio usage for cost tracking.
   * ElevenLabs: inputUnits = chars.
   * Google TTS: inputUnits ≈ chars/4, outputUnits = durationSec * 25.
   */
  private reportAudioUsage(
    onUsage: (u: UsageMetadata) => void,
    voice: Voice,
    charCount: number,
    durationSeconds: number
  ): void {
    const provider = (voice.provider || 'elevenlabs') as string;
    if (provider === 'google-tts' || provider === 'google') {
      onUsage({
        provider: 'google-tts',
        operation: 'audio_synthesize',
        model: 'gemini-2.5-flash-tts',
        inputUnits: Math.ceil(charCount / 4),
        outputUnits: Math.round(durationSeconds * 25),
        durationSeconds,
      });
    } else {
      onUsage({
        provider: 'elevenlabs',
        operation: 'audio_synthesize',
        model: (voice as any).modelId || 'elevenlabs-eleven_v3',
        inputUnits: charCount,
      });
    }
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
   * Load existing scene group assets from story metadata
   * 
   * Retrieves audio buffers for previously generated scene groups from storage.
   * Returns an array with the same length as sceneGroups, containing Buffer for
   * generated groups and null for groups that need generation.
   * 
   * @param story - Story with audioMetadata containing sceneGroupAssetIds
   * @param sceneGroups - Current scene groups for this story
   * @returns Array of buffers (Buffer for existing, null for missing)
   */
  private async loadExistingSceneGroupAssets(
    story: Story,
    sceneGroups: Array<{ scenes: any[]; text: string; totalChars: number }>
  ): Promise<(Buffer | null)[]> {
    const audioMetadata = story.audioMetadata as AudioMetadata | null;
    const existingAssetIds = audioMetadata?.sceneGroupAssetIds || [];
    
    logger.info(
      {
        storyId: story.id,
        totalExpectedGroups: sceneGroups.length,
        existingAssetIds: existingAssetIds.length,
      },
      'Loading existing partial chunks from storage'
    );
    
    // Initialize array with nulls (same length as scene groups)
    const existingBuffers: (Buffer | null)[] = new Array(sceneGroups.length).fill(null);
    
    if (existingAssetIds.length === 0) {
      logger.info({ storyId: story.id }, 'No existing scene group assets found - will generate all');
      return existingBuffers;
    }
    
    // Load existing assets
    for (let i = 0; i < Math.min(existingAssetIds.length, sceneGroups.length); i++) {
      const assetId = existingAssetIds[i];
      
      if (!assetId) {
        logger.debug({ storyId: story.id, groupIndex: i }, 'No asset ID for this group - will generate');
        continue; // Skip null entries
      }
      
      try {
        logger.debug(
          { storyId: story.id, groupIndex: i, assetId },
          'Found asset ID, loading from storage'
        );
        
        const buffer = await this.storageService.getAssetBuffer(assetId);
        existingBuffers[i] = buffer;
        
        logger.info(
          { storyId: story.id, groupIndex: i, assetId, size: buffer.length },
          '✅ Partial chunk loaded from storage - will REUSE'
        );
      } catch (error) {
        logger.warn(
          { storyId: story.id, groupIndex: i, assetId, error: (error as Error).message },
          'Failed to load cached scene group audio - will regenerate'
        );
        // Keep as null - will regenerate
      }
    }
    
    const cachedCount = existingBuffers.filter(b => b !== null).length;
    const missingCount = existingBuffers.filter(b => !b).length;
    const reusePercentage = ((cachedCount / sceneGroups.length) * 100).toFixed(1);
    
    logger.info(
      { 
        storyId: story.id, 
        cached: cachedCount, 
        missing: missingCount,
        total: sceneGroups.length,
        reusePercentage: reusePercentage + '%',
      },
      'Partial chunk loading complete'
    );
    
    return existingBuffers;
  }

  /**
   * Save partial scene group audio to storage
   * 
   * Immediately saves a generated scene group audio to storage and creates
   * an audio_assets record for tracking. This allows retry logic to skip
   * already-generated groups.
   * 
   * @param story - Story object (contains userId and storyId)
   * @param groupIndex - Index of this scene group (0-based)
   * @param audioBuffer - Generated audio data
   * @param duration - Audio duration in seconds
   * @param voiceId - Voice UUID from tts_voices table
   * @param speed - Speech speed multiplier
   * @param voice - Voice object with provider info
   * @returns Asset ID (UUID)
   */
  private async savePartialSceneGroupAudio(
    story: Story,
    groupIndex: number,
    audioBuffer: Buffer,
    duration: number,
    voiceId: string,
    speed: number,
    voice: Voice
  ): Promise<string> {
    // Upload to storage
    const uploadResult = await this.storageService.uploadAsset({
      data: audioBuffer,
      mimeType: 'audio/mpeg',
      userId: story.userId,
      storyId: story.id,
      assetType: 'audio',
    });

    // Create assets record
    const assetRecord = await getAssetRepository().create({
      storyId: story.id,
      sceneId: null,
      assetType: 'audio',
      storagePath: uploadResult.storagePath,
      storageUrl: uploadResult.storageUrl,
      signedUrl: uploadResult.signedUrl,
      signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      mimeType: 'audio/mpeg',
      fileSizeBytes: audioBuffer.length,
      generationParams: {
        groupIndex,
        voiceId,
        speed,
        duration,
        isPartial: true,
      },
      status: 'completed',
    });

    // Get voice record from database by UUID
    const voiceRecord = await getVoiceRepository().findById(voiceId);
    
    if (!voiceRecord) {
      logger.warn({ voiceId }, 'Voice not found in database, saving without voice reference');
    }

    // Create audio_assets record for tracking
    await getAssetRepository().createAudioAsset({
      storyId: story.id,
      assetId: assetRecord.id,
      voiceId: voiceRecord?.id || null, // Use database UUID, not provider ID
      voiceName: '', // Not critical for partial assets
      language: story.language,
      speed: speed.toString() as any,
      durationSeconds: duration.toString() as any,
      provider: voice.provider || 'elevenlabs', // Use voice provider
      status: 'completed',
      textHash: '', // Not needed for partial (groupIndex is the key)
      nightMode: false,
      pitchShift: 0,
      sceneGroupIndex: groupIndex, // ✅ Save group index for partial chunk
      isFinal: false, // ✅ Mark as partial (not final)
      retryCount: 0,
    });

    logger.debug(
      { storyId: story.id, groupIndex, assetId: assetRecord.id, duration, isFinal: false },
      'Partial scene group audio saved'
    );

    return assetRecord.id;
  }

  /**
   * Update story audio metadata in database
   * 
   * Updates the stories.audioMetadata jsonb field with new metadata,
   * including partial generation progress (sceneGroupAssetIds array).
   * 
   * @param storyId - Story ID to update
   * @param audioMetadata - New audio metadata to save
   */
  private async updateStoryAudioMetadata(
    storyId: string,
    audioMetadata: StoryAudioMetadata
  ): Promise<void> {
    await getStoryRepository().updateStory(storyId, {
      audioMetadata: audioMetadata as any, // jsonb field accepts any object
      updatedAt: new Date(),
    });

    logger.debug(
      { 
        storyId, 
        sceneGroupCount: audioMetadata.sceneGroupAssetIds?.length,
        completedGroups: audioMetadata.sceneGroupAssetIds?.filter(id => id !== null).length,
      },
      'Story audio metadata updated'
    );
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
    const story = await getStoryRepository().findById(storyId);

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
      // Get voice from database instead of ElevenLabs API
      const dbVoice = await getVoiceRepository().findById(explicitVoiceId);
      
      if (dbVoice) {
        logger.info({ voiceId: explicitVoiceId, provider: dbVoice.provider }, 'Using explicit voice from database');
        return {
          id: dbVoice.providerVoiceId,
          name: dbVoice.name,
          language: story.language,
          gender: dbVoice.gender as 'male' | 'female' | 'neutral',
          provider: dbVoice.provider as 'elevenlabs' | 'google' | 'openai',
          dbId: dbVoice.id, // Add UUID for cache
        };
      }
      
      logger.warn(
        { voiceId: explicitVoiceId, language: story.language },
        'Explicit voice not found, using automatic selection'
      );
    }

    // Check plan type (default to free)
    const isPremium = userPlanType === 'premium';
    
    // For now: both free and premium use single narrator voice
    // M6+ will implement multi-voice for premium
    // Note: story.ageGroup is a string like "4-5", not a UUID
    // For now, we don't filter by age group (fallback will handle it)
    const narratorVoice = await this.selectVoiceForRole(
      story.language,
      'narrator',
      undefined,
      undefined // TODO M6: Map story.ageGroup to ageGroupId UUID
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
    const voiceRepo = getVoiceRepository();
    
    logger.debug({ language, role, gender: characterGender, ageGroupId }, 'Selecting voice for role');
    
    // Query with optional age group filtering via repository
    const voices = await voiceRepo.findForSelection({
      language,
      role,
      characterGender,
      ageGroupId,
    });
    
    if (voices.length === 0) {
      logger.warn(
        { language, role, gender: characterGender, ageGroupId }, 
        'No voices found with filters, trying fallback'
      );
      
      // Fallback: any active voice for language (ignore age group)
      const fallback = await voiceRepo.findFallbackByLanguage(language);
      
      if (!fallback) {
        return null;
      }
      
      return this.mapDbVoiceToProvider(fallback, language);
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
    
    return this.mapDbVoiceToProvider(selectedDb, language);
  }

  /**
   * Map DB voice record to Voice interface
   */
  private mapDbVoiceToProvider(dbVoice: any, languageOverride?: string): Voice & { dbId?: string } {
    return {
      id: dbVoice.providerVoiceId,
      dbId: dbVoice.id, // Store DB UUID for cache queries
      name: dbVoice.name,
      language: languageOverride || dbVoice.language,
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
      
      if (voice) {
        return { ...voice, language };
      }
      
      logger.warn(
        { voiceId, language },
        'Requested voice not found, using default'
      );
    }

    // Voices are treated as multilingual, so don't filter by language here.
    const voices = await this.audioProvider.getVoices();

    if (voices.length === 0) {
      logger.error({ language }, 'No voices available');
      return null;
    }

    // Prefer non-premium voices for free users
    const freeVoices = voices.filter((v) => !v.isPremium);
    
    if (freeVoices.length > 0) {
      return { ...freeVoices[0], language };
    }

    // Fallback to any voice
    return { ...voices[0], language };
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

  /**
   * Generate forced alignment for story audio (M6)
   * Works with audio from ANY provider (ElevenLabs, Google, OpenAI, Azure)
   * 
   * @param storyId - Story ID
   * @param id - Either audio_assets.id (from on-demand route) or assets.id (from job processor)
   * @param alignmentProvider - Alignment provider instance (injected)
   * @returns Alignment result with word/character timestamps
   */
  async generateAlignmentForStory(
    storyId: string,
    id: string,
    alignmentProvider: IAlignmentProvider
  ): Promise<AlignmentResult> {
    const startTime = Date.now();
    
    try {
      // 1. Fetch story full text from DB
      const story = await getStoryRepository().findById(storyId);
      
      if (!story) {
        throw new Error(`Story not found: ${storyId}`);
      }
      
      // 2. Fetch audio asset metadata - try audio_assets.id first, then assets.id (job passes assetId)
      let audioAssetResult = await getAssetRepository().findFinalAudioAssetWithAsset(id);
      if (!audioAssetResult) {
        audioAssetResult = await getAssetRepository().findFinalAudioAssetWithAssetByAssetId(id);
      }
      
      if (!audioAssetResult) {
        throw new Error(`Audio asset not found or not final: ${id}`);
      }
      
      const { audioAsset, asset } = audioAssetResult;
      
      // 3. Fetch audio buffer from storage (works for any audio provider)
      logger.info({
        storyId,
        audioAssetId: audioAsset.id,
        audioProvider: audioAsset.provider,
        assetId: asset.id,
      }, 'Fetching audio buffer for alignment generation');
      
      const audioBuffer = await this.storageService.getAssetBuffer(asset.id);
      
      // 4. Call IAlignmentProvider (vendor-agnostic)
      logger.info({
        storyId,
        audioProvider: audioAsset.provider,
        alignmentProvider: alignmentProvider.getProviderName(),
        textLength: story.fullText.length,
        audioSize: audioBuffer.length,
      }, 'Generating forced alignment');
      
      const alignmentResult = await alignmentProvider.generateAlignment({
        audioBuffer,
        text: story.fullText,
        language: story.language,
        mimeType: asset.mimeType,
      });
      
      // 5. Log providers used (audio + alignment)
      logger.info({
        storyId,
        audioProvider: audioAsset.provider,
        alignmentProvider: alignmentProvider.getProviderName(),
        averageConfidence: alignmentResult.averageConfidence,
        wordCount: alignmentResult.words.length,
        characterCount: alignmentResult.characters.length,
        durationMs: Date.now() - startTime,
      }, 'Forced alignment generated successfully');
      
      return alignmentResult;
      
    } catch (error) {
      logger.error({
        err: error,
        storyId,
        id,
        durationMs: Date.now() - startTime,
      }, 'Failed to generate alignment for story');
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
let audioDomainServiceInstance: AudioDomainService | null = null;

/**
 * Get AudioDomainService singleton
 */
export function getAudioDomainService(): AudioDomainService {
  if (!audioDomainServiceInstance) {
    logger.info({
      hasApiKey: !!config.audio?.elevenlabs?.apiKey,
      keyLength: config.audio?.elevenlabs?.apiKey?.length || 0,
      keyPrefix: config.audio?.elevenlabs?.apiKey?.substring(0, 5) || '',
      model: config.audio?.elevenlabs?.model,
    }, 'Initializing AudioDomainService');
    
    if (!config.audio?.elevenlabs?.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }
    
    const provider = new ElevenLabsProvider(
      config.audio.elevenlabs.apiKey,
      config.audio.elevenlabs.model
    );
    
    audioDomainServiceInstance = new AudioDomainService(provider);
  }
  return audioDomainServiceInstance;
}
