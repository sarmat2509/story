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
import { GeminiImageProvider } from '../providers/image/gemini';
import { GeminiQuotaProvider } from '../providers/image/gemini/GeminiQuotaProvider';
import { NanoBananaProProvider } from '../providers/image/nanobananapro';
import { ElevenLabsProvider } from '../providers/audio/elevenlabs';
import { StoryDomainService } from '../domain/story';
import { ImageDomainService } from '../domain/image';
import { AudioDomainService } from '../domain/audio';
import { ImageRateLimiter } from './imageRateLimiter';
import type { ITextProvider } from '../providers/base/ITextProvider';
import type { IImageProvider } from '../providers/base/IImageProvider';
import type { IAudioProvider } from '../providers/base/IAudioProvider';
import type { IQuotaProvider } from '../providers/base/IQuotaProvider';
import config from '../config';
import { logger } from '../utils/logger';

// Singleton instances
let storyDomainService: StoryDomainService | null = null;
let imageDomainService: ImageDomainService | null = null;
let audioDomainService: AudioDomainService | null = null;

// Provider instances (private to this module)
let textProvider: ITextProvider | null = null;
let imageProvider: IImageProvider | null = null;
let audioProvider: IAudioProvider | null = null;

// Rate limiting instances
let imageRateLimiter: ImageRateLimiter | null = null;
let quotaProvider: IQuotaProvider | null = null;

/**
 * Get Story Domain Service instance
 * Orchestration should ONLY call this, never getTextProvider()
 */
export function getStoryDomainService(): StoryDomainService {
  if (!storyDomainService) {
    logger.info('Initializing Story Domain Service');
    
    // Create provider (hidden from orchestration)
    const provider = getTextProvider();
    
    // Create domain service with provider
    storyDomainService = new StoryDomainService(provider);
  }
  
  return storyDomainService;
}

/**
 * Get Image Domain Service instance
 * M4: Returns full implementation with rate limiting
 */
export function getImageDomainService(): ImageDomainService {
  if (!imageDomainService) {
    logger.info('Initializing Image Domain Service with rate limiting');
    
    // Initialize rate limiter (singleton)
    getImageRateLimiter();
    
    // Create provider (hidden from orchestration)
    const provider = getImageProvider();
    
    // Create domain service with provider
    imageDomainService = new ImageDomainService(provider);
  }
  
  return imageDomainService;
}

/**
 * Get Audio Domain Service instance
 * M5: Returns full implementation with ElevenLabs
 */
export function getAudioDomainService(): AudioDomainService {
  if (!audioDomainService) {
    logger.info('Initializing Audio Domain Service');
    
    // Create provider (hidden from orchestration)
    const provider = getAudioProvider();
    
    // Create domain service with provider
    audioDomainService = new AudioDomainService(provider);
  }
  
  return audioDomainService;
}

/**
 * Get text provider instance (private)
 * Only called by getStoryDomainService()
 */
function getTextProvider(): ITextProvider {
  if (!textProvider) {
    const vendor = config.ai.textVendor;
    
    logger.info({ vendor }, 'Initializing text provider');
    
    switch (vendor) {
      case 'gemini':
        textProvider = new GeminiTextProvider(config.ai.geminiApiKey);
        break;
      // Future providers can be added here:
      // case 'openai':
      //   textProvider = new OpenAITextProvider(config.ai.openaiApiKey);
      //   break;
      default:
        throw new Error(`Unknown text vendor: ${vendor}`);
    }
  }
  
  return textProvider;
}

/**
 * Get image provider instance (private)
 * Only called by getImageDomainService()
 * Supports:
 * - 'nanobananapro': Gemini 2.5 Flash Image (for cartoon/illustration with character consistency)
 * - 'gemini': Imagen 3 (legacy, for photorealistic images)
 */
function getImageProvider(): IImageProvider {
  if (!imageProvider) {
    const provider = config.image.provider || 'nanobananapro';
    
    logger.info({ provider }, 'Initializing image provider');
    
    switch (provider) {
      case 'nanobananapro':
        // Nano Banana Pro (Gemini 2.5 Flash Image) - for cartoon/illustration
        imageProvider = new NanoBananaProProvider(config.google.apiKey);
        break;
      case 'gemini':
        // Legacy Imagen 3 provider
        imageProvider = new GeminiImageProvider(config.ai.geminiApiKey);
        break;
      default:
        logger.warn({ provider }, 'Unknown image provider, falling back to nanobananapro');
        imageProvider = new NanoBananaProProvider(config.google.apiKey);
    }
  }
  
  return imageProvider;
}

/**
 * Get audio provider instance (private)
 * Only called by getAudioDomainService()
 * M5: Returns ElevenLabs provider
 */
function getAudioProvider(): IAudioProvider {
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
      // Future providers:
      // case 'google':
      //   audioProvider = new GoogleTTSProvider(...);
      //   break;
      default:
        throw new Error(`Unknown audio vendor: ${vendor}`);
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
 * Reset all domain services and providers (useful for testing)
 */
export function resetServices(): void {
  storyDomainService = null;
  imageDomainService = null;
  audioDomainService = null;
  textProvider = null;
  imageProvider = null;
  audioProvider = null;
  imageRateLimiter = null;
  quotaProvider = null;
  logger.info('AI services reset');
}
