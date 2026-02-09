/**
 * Provider-agnostic Forced Alignment Interface
 * Abstracts forced alignment providers (ElevenLabs, Google, Azure, AWS)
 * 
 * M6: Full implementation for alignment generation
 */

/**
 * Alignment character with timing
 */
export interface AlignmentCharacter {
  text: string;
  start: number; // seconds
  end: number;   // seconds
}

/**
 * Alignment word with timing and confidence
 */
export interface AlignmentWord {
  text: string;
  start: number;  // seconds
  end: number;    // seconds
  confidence?: number; // 0-1 confidence score (optional, provider-specific)
}

/**
 * Alignment result
 */
export interface AlignmentResult {
  characters: AlignmentCharacter[];
  words: AlignmentWord[];
  averageConfidence?: number; // Average confidence score (optional)
  language?: string;          // Detected language (optional)
  metadata?: {
    provider: string;
    model?: string;
    durationSeconds: number;
  };
}

/**
 * Alignment request
 */
export interface AlignmentRequest {
  audioBuffer: Buffer;
  text: string;
  language?: string; // Optional language hint ('uk', 'en', etc.)
  mimeType?: string; // Audio format ('audio/mpeg', 'audio/wav', etc.)
}

/**
 * IAlignmentProvider - Provider-agnostic interface for forced alignment
 * 
 * M6 MVP: ElevenLabsAlignmentProvider (ElevenLabs Forced Alignment API)
 * Future: GoogleAlignmentProvider, AzureAlignmentProvider, AWSAlignmentProvider
 * 
 * Domain Services work ONLY with this interface, never with specific providers.
 */
export interface IAlignmentProvider {
  /**
   * Generate forced alignment (audio + text → timecodes)
   * @param request - Alignment request with audio buffer and text
   * @returns Alignment result with word/character timestamps
   */
  generateAlignment(request: AlignmentRequest): Promise<AlignmentResult>;

  /**
   * Test method for provider health check
   * @returns True if provider is healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get provider name for logging/debugging
   */
  getProviderName(): string;
}
