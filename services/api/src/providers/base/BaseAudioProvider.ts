import { IAudioProvider, SynthesizeRequest, SynthesizeResult, Voice, VoiceCatalogEntry } from './IAudioProvider';
import { logger } from '../../utils/logger';
import { config, getConcurrencyLimitForPlan } from '../../config';

/**
 * Base Audio Provider with common functionality
 * - Retry logic with exponential backoff
 * - Input validation
 * - Timeout handling
 * - Error logging
 */
export abstract class BaseAudioProvider implements IAudioProvider {
  protected maxRetries: number;
  protected retryDelayMs: number;
  protected timeoutMs: number;

  constructor() {
    this.maxRetries = config.audio?.maxRetries || 3;
    this.retryDelayMs = config.audio?.retryDelayMs || 2000;
    this.timeoutMs = config.audio?.timeoutMs || 120000;
  }

  /**
   * Abstract methods that must be implemented by providers
   */
  abstract synthesize(request: SynthesizeRequest): Promise<SynthesizeResult>;
  abstract getVoices(language?: string): Promise<Voice[]>;
  abstract getVoice(voiceId: string): Promise<Voice | null>;
  abstract getDefaultVoices(): VoiceCatalogEntry[];
  protected abstract getProviderName(): string;
  protected abstract isValidVoiceId(voiceId: string): boolean;

  /**
   * Health check with error logging
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.performHealthCheck();
      return true;
    } catch (error: any) {
      logger.error(
        { 
          error: error.message, 
          provider: this.getProviderName(),
          stack: error.stack 
        }, 
        `${this.getProviderName()} health check failed`
      );
      return false;
    }
  }

  /**
   * Provider-specific health check implementation
   */
  protected abstract performHealthCheck(): Promise<void>;

  /**
   * Validate synthesis request
   */
  protected validateSynthesizeRequest(request: SynthesizeRequest): void {
    const { text, voiceId, language } = request;

    // Validate text
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for synthesis');
    }

    if (text.length > 100000) {
      throw new Error(`Text exceeds maximum length of 100,000 characters (got ${text.length})`);
    }

    // Validate voice ID
    if (!voiceId || voiceId.trim().length === 0) {
      throw new Error('Voice ID is required');
    }

    if (!this.isValidVoiceId(voiceId)) {
      throw new Error(`Invalid voice ID for ${this.getProviderName()}: ${voiceId}`);
    }

    // Validate language
    if (!language || language.trim().length === 0) {
      throw new Error('Language is required');
    }

    const validLanguages = ['uk', 'en', 'ru', 'es', 'de', 'fr'];
    if (!validLanguages.includes(language)) {
      throw new Error(`Invalid language code: ${language}. Supported: ${validLanguages.join(', ')}`);
    }

    // Validate prosody settings if provided
    if (request.prosody) {
      if (request.prosody.speed !== undefined) {
        if (request.prosody.speed < 0.25 || request.prosody.speed > 4.0) {
          throw new Error(`Speed must be between 0.25 and 4.0 (got ${request.prosody.speed})`);
        }
      }
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt: number = 1,
    operationName: string = 'API call'
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Don't retry on non-retryable errors
      if (this.isNonRetryableError(error)) {
        logger.error(
          { 
            error: error.message, 
            provider: this.getProviderName(),
            operationName 
          },
          `Non-retryable error in ${this.getProviderName()}`
        );
        throw error;
      }

      // Retry on rate limits and temporary errors
      if (attempt < this.maxRetries) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        
        logger.warn(
          { 
            attempt, 
            maxRetries: this.maxRetries, 
            delayMs: delay,
            provider: this.getProviderName(),
            error: error.message,
            operationName
          },
          `Retrying ${this.getProviderName()} request`
        );
        
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, attempt + 1, operationName);
      }

      logger.error(
        { 
          error: error.message,
          attempts: attempt,
          provider: this.getProviderName(),
          operationName
        },
        `${this.getProviderName()} request failed after ${attempt} attempts`
      );
      throw error;
    }
  }

  /**
   * Check if error is non-retryable
   */
  protected isNonRetryableError(error: any): boolean {
    const nonRetryableMessages = [
      'invalid api key',
      'authentication failed',
      'voice not found',
      'invalid voice',
      'invalid request',
      'text is required',
      'voice id is required',
      'exceeds maximum length',
    ];

    const errorMessage = error.message?.toLowerCase() || '';
    return nonRetryableMessages.some(msg => errorMessage.includes(msg));
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = this.timeoutMs,
    operationName: string = 'Operation'
  ): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Estimate audio duration from text
   */
  protected estimateDuration(text: string, wordsPerMinute: number = 150): number {
    const words = text.split(/\s+/).length;
    return Math.ceil((words / wordsPerMinute) * 60);
  }

  getMaxCharsPerChunk(): number {
    return 4500;
  }

  getMaxConcurrency(planSlug?: string): number {
    return getConcurrencyLimitForPlan(planSlug);
  }
}
