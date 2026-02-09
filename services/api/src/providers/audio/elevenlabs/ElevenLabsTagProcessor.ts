import { ITagProcessor, TagProcessingResult, ProsodySettings } from '../../base/ITagProcessor';

/**
 * ElevenLabs native tag support - no conversion needed
 * Tags like [excited], [sighs], [pause] are supported natively by eleven_v3 model
 * 
 * This processor is a pass-through that keeps all tags as-is
 * since ElevenLabs text-to-dialogue API natively understands them.
 */
export class ElevenLabsTagProcessor implements ITagProcessor {
  process(text: string, prosody?: ProsodySettings): TagProcessingResult {
    // ElevenLabs supports tags natively - pass through
    return {
      text: text, // Keep all tags as-is
      emotionalControl: {
        type: 'native',
      },
      extractedEmotions: this.extractEmotionTags(text), // For logging only
    };
  }
  
  /**
   * Extract emotion tags for logging/debugging purposes
   */
  private extractEmotionTags(text: string): string[] {
    const regex = /\[([a-zA-Z\s]+)\]/g;
    const matches = [...text.matchAll(regex)];
    return [...new Set(matches.map(m => m[1].trim().toLowerCase()))];
  }
}
