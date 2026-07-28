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
import { SeedreamImageProvider } from '../providers/image/seedream';
import { ElevenLabsProvider } from '../providers/audio/elevenlabs';
import { GoogleTTSProvider } from '../providers/audio/google/GoogleTTSProvider';
import { OpenAITTSProvider } from '../providers/audio/openai/OpenAITTSProvider';
import { GrokTTSProvider } from '../providers/audio/grok/GrokTTSProvider';
import { ElevenLabsAlignmentProvider } from '../providers/alignment/elevenlabs/ElevenLabsAlignmentProvider';
import { StoryDomainService } from '../domain/story';
import { ImageDomainService } from '../domain/image';
import { GraphicNovelDomainService } from '../domain/graphicNovel';
import { MixedStoryDomainService } from '../domain/mixedStory';
import { ChildPhotoValidationService } from './childPhotoValidationService';
import { ImageRateLimiter } from './imageRateLimiter';
import { TextRateLimiter } from './textRateLimiter';
import { stopAudioRateLimiter } from './audioRateLimiter';
import { GeminiTextQuotaProvider } from '../providers/text/gemini/GeminiTextQuotaProvider';
import type { ITextProvider } from '../providers/base/ITextProvider';
import type { IImageProvider } from '../providers/base/IImageProvider';
import type { IAudioProvider } from '../providers/base/IAudioProvider';
import type { IAlignmentProvider } from '../providers/base/IAlignmentProvider';
import type { IQuotaProvider } from '../providers/base/IQuotaProvider';
import config, { getStoryValidationTextModelOverride } from '../config';
import { logger } from '../utils/logger';
import { setEmbeddingGeneratorForTesting } from './embeddingService';

// Singleton instances
let storyDomainService: StoryDomainService | null = null;
let imageDomainService: ImageDomainService | null = null;
let complexImageDomainService: ImageDomainService | null = null;
let mapTileImageDomainService: ImageDomainService | null = null;
let turnaroundImageDomainService: ImageDomainService | null = null;
let llmTurnaroundImageDomainService: ImageDomainService | null = null;
let graphicNovelDomainService: GraphicNovelDomainService | null = null;
let mixedStoryDomainService: MixedStoryDomainService | null = null;
let childPhotoValidationService: ChildPhotoValidationService | null = null;

// Provider instances (private to this module)
let textProvider: ITextProvider | null = null;
let directorTextProvider: ITextProvider | null = null;
let validationTextProvider: ITextProvider | null = null;
let storyValidationTextProvider: ITextProvider | null = null;
let imageValidationFallbackTextProvider: ITextProvider | null = null;
let imageProvider: IImageProvider | null = null;
let complexImageProvider: IImageProvider | null = null;
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
 * Test-only provider overrides. They keep route/service/domain tests on the
 * production call path while replacing only external provider boundaries.
 */
export interface AiServiceTestOverrides {
  textProvider?: ITextProvider;
  directorTextProvider?: ITextProvider;
  validationTextProvider?: ITextProvider;
  imageValidationFallbackTextProvider?: ITextProvider;
  imageProvider?: IImageProvider;
  complexImageProvider?: IImageProvider;
  mapTileImageProvider?: IImageProvider;
  turnaroundImageProvider?: IImageProvider;
  llmTurnaroundImageProvider?: IImageProvider;
  environmentImageProvider?: IImageProvider;
  batchImageProvider?: IImageProvider | null;
  audioProvider?: IAudioProvider;
  alignmentProvider?: IAlignmentProvider;
  imageQuotaProvider?: IQuotaProvider;
  textQuotaProvider?: IQuotaProvider;
  embeddingGenerator?: (text: string) => Promise<number[]>;
}

let testOverrides: AiServiceTestOverrides | null = null;

/**
 * Get Story Domain Service instance
 * Orchestration should ONLY call this, never getTextProvider()
 */
export function getStoryDomainService(): StoryDomainService {
  if (!storyDomainService) {
    logger.info('Initializing Story Domain Service');

    const mainText = getTextProvider();
    const directorText = getDirectorTextProvider();
    const validationText = getStoryValidationTextProvider();

    storyDomainService = new StoryDomainService(
      mainText,
      directorText,
      validationText,
      getStoryValidationTextModelOverride()
    );
  }

  return storyDomainService;
}

/**
 * Get Image Domain Service instance
 * M4: Returns full implementation for image generation + validation.
 */
export function getImageDomainService(): ImageDomainService {
  if (!imageDomainService) {
    logger.info('Initializing simple Image Domain Service');
    imageDomainService = createImageDomainService(getImageProvider(), 'simple');
  }
  
  return imageDomainService;
}

/**
 * Complex visual path for full comic pages (graphic_novel and mixed_story comic blocks).
 * Kept separate so simple story illustrations can use a cheaper/lighter provider.
 */
export function getComplexImageDomainService(): ImageDomainService {
  if (!complexImageDomainService) {
    logger.info('Initializing complex Image Domain Service');
    complexImageDomainService = createImageDomainService(getComplexImageProvider(), 'complex');
  }

  return complexImageDomainService;
}

export function getGraphicNovelDomainService(): GraphicNovelDomainService {
  if (!graphicNovelDomainService) {
    logger.info('Initializing Graphic Novel Domain Service');
    graphicNovelDomainService = new GraphicNovelDomainService(
      getTextProvider(),
      getValidationTextProvider()
    );
  }

  return graphicNovelDomainService;
}

export function getMixedStoryDomainService(): MixedStoryDomainService {
  if (!mixedStoryDomainService) {
    logger.info('Initializing Mixed Story Domain Service');
    mixedStoryDomainService = new MixedStoryDomainService(getDirectorTextProvider());
  }

  return mixedStoryDomainService;
}

export function getChildPhotoValidationService(): ChildPhotoValidationService {
  if (!childPhotoValidationService) {
    logger.info(
      { model: config.ai.geminiVisionModel || config.ai.validationModel },
      'Initializing child profile photo validation service'
    );
    childPhotoValidationService = new ChildPhotoValidationService(
      getValidationTextProvider(),
      config.ai.geminiVisionModel || config.ai.validationModel
    );
  }

  return childPhotoValidationService;
}

/**
 * Reward map tiles can be model-switched independently from story scene generation.
 */
export function getMapTileImageDomainService(): ImageDomainService {
  if (!mapTileImageDomainService) {
    if (testOverrides?.mapTileImageProvider) {
      mapTileImageDomainService = new ImageDomainService(testOverrides.mapTileImageProvider);
      return mapTileImageDomainService;
    }
    const model = config.image.mapTileModel || config.image.simpleModel || 'gemini-3.1-flash-lite-image';
    logger.info({ model }, 'Initializing map tile image provider');
    mapTileImageDomainService = new ImageDomainService(
      new NanoBananaProProvider(config.google.apiKey, model),
    );
  }

  return mapTileImageDomainService;
}

/** Dedicated character turnaround image path, with a test-replaceable provider boundary. */
export function getTurnaroundImageDomainService(): ImageDomainService {
  if (!turnaroundImageDomainService) {
    const provider =
      testOverrides?.turnaroundImageProvider ??
      new NanoBananaProProvider(config.google.apiKey, config.image.turnaroundModel);
    turnaroundImageDomainService = new ImageDomainService(provider);
  }
  return turnaroundImageDomainService;
}

/** Lightweight text-only turnaround image path, with a test-replaceable provider boundary. */
export function getLlmTurnaroundImageDomainService(): ImageDomainService {
  if (!llmTurnaroundImageDomainService) {
    const provider =
      testOverrides?.llmTurnaroundImageProvider ??
      createConfiguredImageProvider({
        provider: config.image.simpleProvider || 'nanobananapro',
        modelOverride: config.image.simpleModel,
        role: 'simple',
      });
    llmTurnaroundImageDomainService = new ImageDomainService(provider);
  }
  return llmTurnaroundImageDomainService;
}

/**
 * Get text provider instance
 * Used by getStoryDomainService() and translation services
 */
export function getTextProvider(): ITextProvider {
  if (testOverrides?.textProvider) {
    return testOverrides.textProvider;
  }
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
  if (testOverrides?.directorTextProvider) {
    return testOverrides.directorTextProvider;
  }
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
  if (testOverrides?.validationTextProvider) {
    return testOverrides.validationTextProvider;
  }
  const validationVendor = normalizedValidationTextVendor();
  const validationModel = config.ai.validationModel;

  if (validationVendor === 'openai') {
    if (config.ai.openaiApiKey?.trim()) {
      if (!validationTextProvider) {
        logger.info(
          { model: config.ai.openaiValidationModel },
          'Initializing OpenAI primary provider for image validation'
        );
        validationTextProvider = new OpenAITextProvider(
          config.ai.openaiApiKey,
          config.ai.openaiValidationModel,
        );
      }

      return validationTextProvider;
    }

    logger.warn(
      { validationVendor, model: config.ai.openaiValidationModel },
      'OpenAI validation provider unavailable, falling back to Gemini validation provider',
    );
  }

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

function getStoryValidationTextProvider(): ITextProvider {
  if (testOverrides?.validationTextProvider) {
    return testOverrides.validationTextProvider;
  }

  const requestedVendor = String(config.ai.storyValidationTextVendor || 'openai')
    .trim()
    .toLowerCase();
  if (requestedVendor === 'openai' && config.ai.openaiApiKey?.trim()) {
    if (!storyValidationTextProvider) {
      logger.info(
        { model: config.ai.openaiStoryValidationModel },
        'Initializing dedicated story coherence validation provider'
      );
      storyValidationTextProvider = new OpenAITextProvider(
        config.ai.openaiApiKey,
        config.ai.openaiStoryValidationModel
      );
    }
    return storyValidationTextProvider;
  }

  if (requestedVendor !== 'gemini' && requestedVendor !== 'openai') {
    logger.warn(
      { storyValidationTextVendor: config.ai.storyValidationTextVendor },
      'Unknown story validation vendor; using the available fallback'
    );
  }
  if (config.ai.geminiApiKey?.trim()) {
    if (!storyValidationTextProvider) {
      logger.info(
        { model: config.ai.geminiStoryValidationModel },
        'Initializing Gemini story coherence validation provider'
      );
      storyValidationTextProvider = new GeminiTextProvider(
        config.ai.geminiApiKey,
        config.ai.geminiStoryValidationModel
      );
    }
    return storyValidationTextProvider;
  }

  if (config.ai.openaiApiKey?.trim()) {
    if (!storyValidationTextProvider) {
      storyValidationTextProvider = new OpenAITextProvider(
        config.ai.openaiApiKey,
        config.ai.openaiStoryValidationModel
      );
    }
    return storyValidationTextProvider;
  }
  return getValidationTextProvider();
}

function normalizedValidationTextVendor(): 'gemini' | 'openai' {
  const vendor = String(config.ai.validationTextVendor || 'gemini').trim().toLowerCase();
  if (vendor === 'openai') return 'openai';
  if (vendor === 'gemini') return 'gemini';
  logger.warn(
    { validationTextVendor: config.ai.validationTextVendor },
    'Unknown AI_VALIDATION_TEXT_VENDOR, falling back to gemini',
  );
  return 'gemini';
}

function getImageValidationFallbackTextProvider(): ITextProvider | undefined {
  if (testOverrides?.imageValidationFallbackTextProvider) {
    return testOverrides.imageValidationFallbackTextProvider;
  }
  const validationVendor = normalizedValidationTextVendor();

  if (validationVendor === 'openai') {
    if (!config.ai.geminiApiKey?.trim()) {
      return undefined;
    }

    if (!imageValidationFallbackTextProvider) {
      logger.info(
        { model: config.ai.validationModel },
        'Initializing Gemini fallback provider for image validation'
      );
      imageValidationFallbackTextProvider = new GeminiTextProvider(
        config.ai.geminiApiKey,
        config.ai.validationModel,
      );
    }

    return imageValidationFallbackTextProvider;
  }

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

function createImageDomainService(
  provider: IImageProvider,
  visualComplexity: 'simple' | 'complex'
): ImageDomainService {
  // Inject text provider for Vision-based image validation (only when enabled)
  const validationTextProvider = config.image.enableValidation
    ? getValidationTextProvider()
    : undefined;
  const validationFallbackTextProvider = config.image.enableValidation
    ? getImageValidationFallbackTextProvider()
    : undefined;
  if (validationTextProvider) {
    logger.info(
      { visualComplexity },
      'Image validation enabled — injecting text provider for Gemini Vision'
    );
  }

  return new ImageDomainService(provider, validationTextProvider, validationFallbackTextProvider);
}

/**
 * Get simple image provider instance (private).
 * Used for first-pass story illustrations and other light visuals.
 */
function getImageProvider(): IImageProvider {
  if (testOverrides?.imageProvider) {
    return testOverrides.imageProvider;
  }
  if (!imageProvider) {
    imageProvider = createConfiguredImageProvider({
      provider: config.image.simpleProvider || 'nanobananapro',
      modelOverride: config.image.simpleModel || 'gemini-3.1-flash-lite-image',
      role: 'simple',
    });
  }

  return imageProvider;
}

/**
 * Get complex image provider instance (private).
 * Used for full comic pages and second-pass story illustrations after validation failure.
 */
function getComplexImageProvider(): IImageProvider {
  if (testOverrides?.complexImageProvider) {
    return testOverrides.complexImageProvider;
  }
  if (!complexImageProvider) {
    complexImageProvider = createConfiguredImageProvider({
      provider: config.image.complexProvider || 'nanobananapro',
      modelOverride: config.image.complexModel || 'gemini-3.1-flash-image',
      role: 'complex',
    });
  }

  return complexImageProvider;
}

/**
 * Supports:
 * - 'nanobananapro': Gemini Flash/Pro Image (for cartoon/illustration with character consistency)
 * - 'openai': GPT Image via Responses API (for character consistency with input_fidelity)
 * - 'seedream': BytePlus ModelArk Seedream image generation with references
 * - 'gemini': Gemini Image stack with explicit route model or simple-route fallback
 */
function createConfiguredImageProvider(params: {
  provider: string;
  role: 'simple' | 'complex';
  modelOverride?: string;
}): IImageProvider {
  const provider = params.provider || 'nanobananapro';

  logger.info(
    { provider, role: params.role, modelOverride: params.modelOverride || null },
    'Initializing image provider'
  );

  switch (provider) {
    case 'nanobananapro':
      // Nano Banana Pro (Gemini Flash/Pro Image) - for cartoon/illustration
      return new NanoBananaProProvider(config.google.apiKey, params.modelOverride);
    case 'openai':
      // OpenAI GPT Image via Responses API
      return new OpenAIImageProvider(config.ai.openaiApiKey);
    case 'seedream':
      // BytePlus ModelArk Seedream via OpenAI-compatible Images API
      return new SeedreamImageProvider(config.seedream.apiKey, params.modelOverride);
    case 'gemini':
      return new NanoBananaProProvider(
        config.google.apiKey,
        params.modelOverride || config.image.simpleModel
      );
    default:
      logger.warn(
        { provider, role: params.role },
        'Unknown image provider, falling back to nanobananapro'
      );
      return new NanoBananaProProvider(config.google.apiKey, params.modelOverride);
  }
}

/**
 * Environment and outfit reference images use the simple image route.
 */
export function getEnvironmentImageProvider(): IImageProvider {
  if (testOverrides?.environmentImageProvider) {
    return testOverrides.environmentImageProvider;
  }
  if (!environmentImageProvider) {
    environmentImageProvider = createConfiguredImageProvider({
      provider: config.image.simpleProvider || 'nanobananapro',
      modelOverride: config.image.simpleModel,
      role: 'simple',
    });
  }
  return environmentImageProvider;
}

/**
 * Get batch image provider (GeminiBatchImageProvider) for scheduled continuations.
 * Returns null if BATCH_IMAGE_GCS_BUCKET is not set.
 */
export function getBatchImageProvider(): IImageProvider | null {
  if (testOverrides && 'batchImageProvider' in testOverrides) {
    return testOverrides.batchImageProvider ?? null;
  }
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
 * M5: Supports ElevenLabs, Google Cloud TTS, OpenAI TTS, Grok (xAI) TTS
 */
function getAudioProviderInternal(): IAudioProvider {
  if (testOverrides?.audioProvider) {
    return testOverrides.audioProvider;
  }
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
  if (testOverrides?.imageQuotaProvider) {
    return testOverrides.imageQuotaProvider;
  }
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
 * Prefer the domain/audio singleton when full synthesis orchestration is needed.
 */
export function getAudioProvider(): IAudioProvider {
  return getAudioProviderInternal();
}

/**
 * Get audio provider by specific vendor name
 * Used by scripts that need to work with multiple providers
 */
export function getAudioProviderByName(providerName: string): IAudioProvider {
  if (testOverrides?.audioProvider) {
    return testOverrides.audioProvider;
  }
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
  if (testOverrides?.alignmentProvider) {
    return testOverrides.alignmentProvider;
  }
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
  if (testOverrides?.textQuotaProvider) {
    return testOverrides.textQuotaProvider;
  }
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
 * Install provider fakes without replacing any production domain/service logic.
 * The guard prevents test hooks from being enabled by a production process.
 */
export function installAiServiceTestOverrides(overrides: AiServiceTestOverrides): void {
  if (config.nodeEnv === 'production') {
    throw new Error('AI test overrides cannot be installed in production');
  }
  resetServices();
  testOverrides = { ...overrides };
  setEmbeddingGeneratorForTesting(overrides.embeddingGenerator ?? null);
}

export function clearAiServiceTestOverrides(): void {
  resetServices();
  testOverrides = null;
}

/**
 * Reset all domain services and providers (useful for testing)
 */
export function resetServices(): void {
  setEmbeddingGeneratorForTesting(null);
  storyDomainService = null;
  imageDomainService = null;
  complexImageDomainService = null;
  mapTileImageDomainService = null;
  turnaroundImageDomainService = null;
  llmTurnaroundImageDomainService = null;
  graphicNovelDomainService = null;
  mixedStoryDomainService = null;
  childPhotoValidationService = null;
  textProvider = null;
  directorTextProvider = null;
  validationTextProvider = null;
  storyValidationTextProvider = null;
  imageValidationFallbackTextProvider = null;
  imageProvider = null;
  complexImageProvider = null;
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
