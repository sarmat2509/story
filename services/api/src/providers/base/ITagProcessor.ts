/**
 * Abstract interface for processing [emotion] tags
 * Each provider implements its own tag conversion strategy
 */
export interface ITagProcessor {
  /**
   * Process text with [emotion] tags for specific TTS provider
   * 
   * @param text - Input text with [emotion] tags
   * @param prosody - Optional prosody settings
   * @returns Processed result with provider-specific format
   */
  process(text: string, prosody?: ProsodySettings): TagProcessingResult;
}

export interface TagProcessingResult {
  /**
   * Cleaned text for TTS synthesis
   * - ElevenLabs: Keeps tags as-is
   * - Google/OpenAI: Emotion tags removed
   */
  text: string;
  
  /**
   * Provider-specific emotional control
   * - ElevenLabs: undefined (uses tags in text)
   * - Google: "Say in excited and happy way"
   * - OpenAI: "Speak in cheerful and energetic tone"
   */
  emotionalControl?: {
    type: 'prompt' | 'instructions' | 'native';
    value?: string;
  };
  
  /**
   * Extracted emotion tags for logging/debugging
   */
  extractedEmotions?: string[];
}

export interface ProsodySettings {
  speed?: number;
  pitch?: number;
  tone?: string; // 'adventurous', 'calm', 'educational', etc.
  stability?: number;
  similarity_boost?: number;
}
