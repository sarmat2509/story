/**
 * AI Service - Domain Service Factory
 * Manages Domain Service instances with singleton pattern
 * 
 * Architecture:
 * - Orchestration calls Domain Services (NOT providers)
 * - This factory creates Domain Services with appropriate providers
 * - Providers are implementation details hidden from Orchestration
 */

import { GeminiTextProvider } from '../providers/text/gemini';
import { OpenAITextProvider } from '../providers/text/openai';
import { GeminiQuotaProvider } from '../providers/image/gemini/GeminiQuotaProvider';
import { NanoBananaProProvider } from '../providers/image/nanobananapro';
import { OpenAIImageProvider } from '../providers/image/openai';
import { ElevenLabsProvider } from '../providers/audio/elevenlabs';
import { GoogleTTSProvider } from '../providers/audio/google/GoogleTTSProvider';
import { OpenAITTSProvider } from '../providers/audio/openai/OpenAITTSProvider';
import { GrokTTSProvider } from '../providers/audio/grok/GrokTTSProvider';
import { ElevenLabsAlignmentProvider } from '../providers/alignment/elevenlabs/ElevenLabsAlignmentProvider';
import { StoryDomainService } from '../domain/story';
import { ImageDomainService } from '../domain/image';
import { AudioDomainService } from '../domain/audio';
import { GraphicNovelDomainService } from '../domain/graphicNovel';
import { ImageRateLimiter } from './imageRateLimiter';
import { TextRateLimiter } from './textRateLimiter';
import { stopAudioRateLimiter } from './audioRateLimiter';
import { GeminiTextQuotaProvider } from '../providers/text/gemini/GeminiTextQuotaProvider';
import type { ITextProvider } from '../providers/base/ITextProvider';
import type { IImageProvider } from '../providers/base/IImageProvider';
import type { IAudioProvider } from '../providers/base/IAudioProvider';
import type { IAlignmentProvider } from '../providers/base/IAlignmentProvider';
import type { IQuotaProvider } from '../providers/base/IQuotaProvider';
import config from '../config';
import { logger } from '../utils/logger';

// Singleton instances
let storyDomainService: StoryDomainService | null = null;
let imageDomainService: ImageDomainService | null = null;
let mapTileImageDomainService: ImageDomainService | null = null;
let audioDomainService: AudioDomainService | null = null;
let graphicNovelDomainService: GraphicNovelDomainService | null = null;

// Provider instances (private to this module)
let textProvider: ITextProvider | null = null;
let directorTextProvider: ITextProvider | null = null;
let validationTextProvider: ITextProvider | null = null;
let imageValidationFallbackTextProvider: ITextProvider | null = null;
let imageProvider: IImageProvider | null = null;
let environmentImageProvider: IImageProvider | null = null;
let batchImageProvider: IImageProvider | null = null;
let audioProvider: IAudioProvider | null = null;
let alignmentProvider: IAlignmentProvider | null = null;

// Rate limiting instances
let imageRateLimiter: ImageRateLimiter | null = null;
let textRateLimiter: TextRateLimiter | null = null;
let quotaProvider: IQuotaProvider | null = null;
let textQuotaProvider: IQuotaProvider | null = null;

/**
 * Get Story Domain Service instance
 * Orchestration should ONLY call this, never getTextProvider()
 */
export function getStoryDomainService(): StoryDomainService {
  if (!storyDomainService) {
    logger.info('Initializing Story Domain Service');

    const mainText = getTextProvider();
    const directorText = getDirectorTextProvider();
    const validationText = getValidationTextProvider();

    storyDomainService = new StoryDomainService(mainText, directorText, validationText);
  }

  return storyDomainService;
}

/**
 * Get Image Domain Service instance
 * M4: Returns full implementation for image generation + validation.
 */
export function getImageDomainService(): ImageDomainService {
  if (!imageDomainService) {
    logger.info('Initializing Image Domain Service');
    
    // Create image provider (hidden from orchestration)
    const provider = getImageProvider();
    
    // Inject text provider for Vision-based image validation (only when enabled)
    const validationTextProvider = config.image.enableValidation
      ? getValidationTextProvider()
      : undefined;
    const validationFallbackTextProvider = config.image.enableValidation
      ? getImageValidationFallbackTextProvider()
      : undefined;
    if (validationTextProvider) {
      logger.info('Image validation enabled — injecting text provider for Gemini Vision');
    }
    
    // Create domain service with both providers
    imageDomainService = new ImageDomainService(
      provider,
      validationTextProvider,
      validationFallbackTextProvider,
    );
  }
  
  return imageDomainService;
}

export function getGraphicNovelDomainService(): GraphicNovelDomainService {
  if (!graphicNovelDomainService) {
    logger.info('Initializing Graphic Novel Domain Service');
    graphicNovelDomainService = new GraphicNovelDomainService(getTextProvider());
  }

  return graphicNovelDomainService;
}

/**
 * Reward map tiles can be model-switched independently from story scene generation.
 */
export function getMapTileImageDomainService(): ImageDomainService {
  if (!mapTileImageDomainService) {
    const model = config.image.mapTileModel || config.nanoBanana?.model || 'gemini-3.1-flash-image';
    logger.info({ model }, 'Initializing map tile image provider');
    mapTileImageDomainService = new ImageDomainService(
      new NanoBananaProProvider(config.google.apiKey, model),
    );
  }

  return mapTileImageDomainService;
}

/**
 * Get Audio Domain Service instance
 * M5: Returns full implementation with ElevenLabs
 */
export function getAudioDomainService(): AudioDomainService {
  if (!audioDomainService) {
    logger.info('Initializing Audio Domain Service');
    
    // Create provider (hidden from orchestration)
    const provider = getAudioProviderInternal();
    
    // Create domain service with provider
    audioDomainService = new AudioDomainService(provider);
  }
  
  return audioDomainService;
}

/**
 * Get text provider instance
 * Used by getStoryDomainService() and translation services
 */
export function getTextProvider(): ITextProvider {
  if (!textProvider) {
    const vendor = config.ai.textVendor;
    
    logger.info({ vendor }, 'Initializing text provider');
    
    switch (vendor) {
      case 'gemini':
        textProvider = new GeminiTextProvider(config.ai.geminiApiKey, config.ai.modelVersion);
        break;
      case 'openai':
        textProvider = new OpenAITextProvider(config.ai.openaiApiKey, config.ai.openaiModel);
        break;
      default:
        throw new Error(`Unknown text vendor: ${vendor}`);
    }
  }
  
  return textProvider;
}

function effectiveDirectorTextVendor(): string {
  return config.ai.directorTextVendor || config.ai.textVendor;
}

/**
 * Text provider for Director only. When AI_DIRECTOR_TEXT_VENDOR matches AI_TEXT_VENDOR (or is unset),
 * returns the same instance as getTextProvider().
 */
export function getDirectorTextProvider(): ITextProvider {
  if (effectiveDirectorTextVendor() === config.ai.textVendor) {
    return getTextProvider();
  }

  if (!directorTextProvider) {
    const vendor = effectiveDirectorTextVendor();
    logger.info({ vendor }, 'Initializing director text provider');

    switch (vendor) {
      case 'gemini':
        directorTextProvider = new GeminiTextProvider(config.ai.geminiApiKey, config.ai.modelVersion);
        break;
      case 'openai':
        directorTextProvider = new OpenAITextProvider(
          config.ai.openaiApiKey,
          config.ai.openaiDirectorModel,
        );
        break;
      default:
        throw new Error(`Unknown director text vendor: ${vendor}`);
    }
  }

  return directorTextProvider;
}

export function getValidationTextProvider(): ITextProvider {
  const validationModel = config.ai.validationModel;

  if (config.ai.geminiApiKey?.trim()) {
    if (
      config.ai.textVendor === 'gemini' &&
      validationModel === config.ai.modelVersion
    ) {
      return getTextProvider();
    }

    if (!validationTextProvider) {
      logger.info({ model: validationModel }, 'Initializing validation text provider');
      validationTextProvider = new GeminiTextProvider(config.ai.geminiApiKey, validationModel);
    }

    return validationTextProvider;
  }

  logger.warn(
    { textVendor: config.ai.textVendor, validationModel },
    'Gemini validation provider unavailable, falling back to main text provider',
  );
  return getTextProvider();
}

function getImageValidationFallbackTextProvider(): ITextProvider | undefined {
  if (!config.ai.openaiApiKey?.trim()) {
    return undefined;
  }

  if (!imageValidationFallbackTextProvider) {
    logger.info(
      { model: config.ai.openaiValidationModel },
      'Initializing OpenAI fallback provider for image validation'
    );
    imageValidationFallbackTextProvider = new OpenAITextProvider(
      config.ai.openaiApiKey,
      config.ai.openaiValidationModel,
    );
  }

  return imageValidationFallbackTextProvider;
}

/**
 * Get image provider instance (private)
 * Only called by getImageDomainService()
 * Supports:
 * - 'nanobananapro': Gemini Flash/Pro Image (for cartoon/illustration with character consistency)
 * - 'openai': GPT Image via Responses API (for character consistency with input_fidelity)
 * - 'gemini': Gemini 2.5 Flash Image only (same stack as env / cheap paths; Imagen removed)
 */
function getImageProvider(): IImageProvider {
  if (!imageProvider) {
    const provider = config.image.provider || 'nanobananapro';
    
    logger.info({ provider }, 'Initializing image provider');
    
    switch (provider) {
      case 'nanobananapro':
        // Nano Banana Pro (Gemini Flash/Pro Image) - for cartoon/illustration
        imageProvider = new NanoBananaProProvider(config.google.apiKey);
        break;
      case 'openai':
        // OpenAI GPT Image via Responses API
        imageProvider = new OpenAIImageProvider(config.ai.openaiApiKey);
        break;
      case 'gemini':
        imageProvider = new NanoBananaProProvider(
          config.google.apiKey,
          config.image.flashImageModel,
        );
        break;
      default:
        logger.warn({ provider }, 'Unknown image provider, falling back to nanobananapro');
        imageProvider = new NanoBananaProProvider(config.google.apiKey);
    }
  }
  
  return imageProvider;
}

/**
 * Environment reference images — Gemini 2.5 Flash Image (API key), not Vertex Imagen.
 */
export function getEnvironmentImageProvider(): IImageProvider {
  if (!environmentImageProvider) {
    logger.info(
      { model: config.image.flashImageModel },
      'Initializing environment image provider (Gemini Flash Image)',
    );
    environmentImageProvider = new NanoBananaProProvider(
      config.google.apiKey,
      config.image.flashImageModel,
    );
  }
  return environmentImageProvider;
}

/**
 * Get batch image provider (GeminiBatchImageProvider) for scheduled continuations.
 * Returns null if BATCH_IMAGE_GCS_BUCKET is not set.
 */
export function getBatchImageProvider(): IImageProvider | null {
  if (!config.image.gemini.batchGcsBucket) {
    return null;
  }
  if (!batchImageProvider) {
    logger.info('Initializing batch image provider (Gemini Batch)');
    const { GeminiBatchImageProvider } = require('../providers/image/gemini/GeminiBatchImageProvider');
    batchImageProvider = new GeminiBatchImageProvider();
  }
  return batchImageProvider;
}

/**
 * Get audio provider instance (private)
 * Only called by getAudioDomainService()
 * M5: Supports ElevenLabs, Google Cloud TTS, OpenAI TTS, Grok (xAI) TTS
 */
function getAudioProviderInternal(): IAudioProvider {
  if (!audioProvider) {
    const vendor = config.audio?.provider || 'elevenlabs';
    
    logger.info({ vendor }, 'Initializing audio provider');
    
    switch (vendor) {
      case 'elevenlabs':
        if (!config.audio?.elevenlabs?.apiKey) {
          throw new Error('ElevenLabs API key is required');
        }
        audioProvider = new ElevenLabsProvider(
          config.audio.elevenlabs.apiKey,
          config.audio.elevenlabs.model
        );
        break;
      case 'google':
        if (!config.audio?.google?.projectId || !config.audio?.google?.credentials) {
          throw new Error('Google Cloud project ID and credentials are required');
        }
        audioProvider = new GoogleTTSProvider(
          config.audio.google.projectId,
          config.audio.google.credentials,
          config.audio.google.model
        );
        break;
      case 'openai':
        if (!config.audio?.openai?.apiKey) {
          throw new Error('OpenAI API key is required');
        }
        audioProvider = new OpenAITTSProvider(
          config.audio.openai.apiKey,
          config.audio.openai.model
        );
        break;
      case 'grok':
        if (!config.audio?.grok?.apiKey) {
          throw new Error('Grok/xAI API key is required (GROK_API_KEY or XAI_API_KEY)');
        }
        audioProvider = new GrokTTSProvider(config.audio.grok.apiKey);
        break;
      default:
        throw new Error(`Unknown audio vendor: ${vendor}. Supported: elevenlabs, google, openai, grok`);
    }
  }
  
  return audioProvider;
}

/**
 * Get Quota Provider instance (vendor-specific)
 * Private - used only by getImageRateLimiter()
 */
function getQuotaProvider(): IQuotaProvider {
  if (!quotaProvider) {
    const vendor = config.ai.imageVendor || 'gemini';
    
    logger.info({ vendor }, 'Initializing quota provider');
    
    switch (vendor) {
      case 'gemini':
        quotaProvider = new GeminiQuotaProvider();
        break;
      // Future providers:
      // case 'openai':
      //   quotaProvider = new OpenAIQuotaProvider();
      //   break;
      default:
        throw new Error(`Unknown image vendor for quota provider: ${vendor}`);
    }
  }
  
  return quotaProvider;
}

/**
 * Get Image Rate Limiter instance
 * Global singleton with vendor-specific quota provider injected
 */
export function getImageRateLimiter(): ImageRateLimiter {
  if (!imageRateLimiter) {
    logger.info('Initializing Image Rate Limiter with quota provider');
    
    const provider = getQuotaProvider(); // Vendor-specific
    imageRateLimiter = new ImageRateLimiter(provider); // DI
  }
  
  return imageRateLimiter;
}

/**
 * Get Audio Provider instance (exported for testing/seeding)
 * Usually should call getAudioDomainService() instead
 */
export function getAudioProvider(): IAudioProvider {
  return getAudioProviderInternal();
}

/**
 * Get audio provider by specific vendor name
 * Used by scripts that need to work with multiple providers
 */
export function getAudioProviderByName(providerName: string): IAudioProvider {
  logger.info({ providerName }, 'Creating audio provider by name');
  
  switch (providerName) {
    case 'elevenlabs':
      if (!config.audio?.elevenlabs?.apiKey) {
        throw new Error('ElevenLabs API key is required');
      }
      return new ElevenLabsProvider(
        config.audio.elevenlabs.apiKey,
        config.audio.elevenlabs.model
      );
    
    case 'google':
      if (!config.audio?.google?.projectId || !config.audio?.google?.credentials) {
        logger.error({
          hasProjectId: !!config.audio?.google?.projectId,
          hasCredentials: !!config.audio?.google?.credentials,
          projectId: config.audio?.google?.projectId,
          credentials: config.audio?.google?.credentials,
        }, 'Google Cloud credentials missing');
        throw new Error('Google Cloud project ID and credentials are required');
      }
      logger.info({
        projectId: config.audio.google.projectId,
        credentialsPath: config.audio.google.credentials,
        model: config.audio.google.model,
      }, 'Creating GoogleTTSProvider');
      return new GoogleTTSProvider(
        config.audio.google.projectId,
        config.audio.google.credentials,
        config.audio.google.model
      );
    
    case 'openai':
      if (!config.audio?.openai?.apiKey) {
        throw new Error('OpenAI API key is required');
      }
      return new OpenAITTSProvider(
        config.audio.openai.apiKey,
        config.audio.openai.model
      );

    case 'grok':
      if (!config.audio?.grok?.apiKey) {
        throw new Error('Grok/xAI API key is required (GROK_API_KEY or XAI_API_KEY)');
      }
      return new GrokTTSProvider(config.audio.grok.apiKey);

    default:
      throw new Error(`Unknown audio provider: ${providerName}. Supported: elevenlabs, google, openai, grok`);
  }
}

/**
 * Get Alignment Provider instance
 * M6: Forced alignment provider (works with audio from any provider)
 * Singleton pattern for provider reuse
 */
export function getAlignmentProvider(): IAlignmentProvider {
  if (!alignmentProvider) {
    const vendor = config.ai.alignmentVendor || 'elevenlabs';
    
    logger.info({ vendor }, 'Initializing alignment provider');
    
    switch (vendor) {
      case 'elevenlabs':
        if (!config.audio?.elevenlabs?.apiKey) {
          throw new Error('ElevenLabs API key is required for alignment');
        }
        alignmentProvider = new ElevenLabsAlignmentProvider(
          config.audio.elevenlabs.apiKey
        );
        break;
      
      // Future providers:
      // case 'google':
      //   alignmentProvider = new GoogleAlignmentProvider(config.ai.geminiApiKey);
      //   break;
      // case 'azure':
      //   alignmentProvider = new AzureAlignmentProvider(config.azure.key);
      //   break;
      
      default:
        throw new Error(`Unknown alignment vendor: ${vendor}. Supported: elevenlabs`);
    }
  }
  
  return alignmentProvider;
}

/**
 * Get Text Quota Provider instance (vendor-specific)
 * Private - used only by getTextRateLimiter()
 */
function getTextQuotaProvider(): IQuotaProvider {
  if (!textQuotaProvider) {
    const vendor = config.ai.textVendor || 'gemini';
    
    switch (vendor) {
      case 'gemini':
        textQuotaProvider = new GeminiTextQuotaProvider();
        break;
      // Future: case 'openai': textQuotaProvider = new OpenAITextQuotaProvider(); break;
      default:
        logger.warn({ vendor }, 'No text quota provider for vendor, using Gemini default');
        textQuotaProvider = new GeminiTextQuotaProvider();
    }
  }
  return textQuotaProvider;
}

/**
 * Get Text Rate Limiter instance
 * Global singleton with vendor-specific quota provider injected
 */
export function getTextRateLimiter(): TextRateLimiter {
  if (!textRateLimiter) {
    logger.info('Initializing Text Rate Limiter with quota provider');
    const provider = getTextQuotaProvider();
    textRateLimiter = new TextRateLimiter(provider);
  }
  return textRateLimiter;
}

/**
 * Stop all rate limiter intervals for graceful shutdown
 */
export function stopAllRateLimiters(): void {
  if (imageRateLimiter) {
    imageRateLimiter.stop();
  }
  if (textRateLimiter) {
    textRateLimiter.stop();
  }
  stopAudioRateLimiter();
  logger.info('All rate limiters stopped');
}

/**
 * Reset all domain services and providers (useful for testing)
 */
export function resetServices(): void {
  storyDomainService = null;
  imageDomainService = null;
  audioDomainService = null;
  textProvider = null;
  directorTextProvider = null;
  validationTextProvider = null;
  imageValidationFallbackTextProvider = null;
  imageProvider = null;
  environmentImageProvider = null;
  batchImageProvider = null;
  audioProvider = null;
  alignmentProvider = null;
  imageRateLimiter = null;
  textRateLimiter = null;
  quotaProvider = null;
  textQuotaProvider = null;
  logger.info('AI services reset');
}
