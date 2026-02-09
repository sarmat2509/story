import { ITagProcessor, TagProcessingResult, ProsodySettings } from '../../base/ITagProcessor';
import { AUDIO_TAGS } from '../../../constants/audioTags';

/**
 * OpenAI TTS tag processor
 * Strategy: Extract emotions → build instructions parameter
 * Note: Works ONLY with gpt-4o-mini-tts model (not tts-1 or tts-1-hd)
 * 
 * LIMITATION: OpenAI applies instructions to entire text.
 * Cannot have different emotions per sentence in single request.
 * Solution: Extract dominant emotion or make multiple requests.
 */
export class OpenAITagProcessor implements ITagProcessor {
  process(text: string, prosody?: ProsodySettings): TagProcessingResult {
    // 1. Extract emotion tags
    const emotions = this.extractEmotionTags(text);
    
    // 2. Remove ALL tags (OpenAI doesn't support markup tags)
    let cleanText = this.stripAllTags(text);
    
    // 3. Build instructions from emotions
    const instructions = this.buildInstructions(emotions, prosody);
    
    return {
      text: cleanText,
      emotionalControl: {
        type: 'instructions',
        value: instructions,
      },
      extractedEmotions: emotions,
    };
  }
  
  private extractEmotionTags(text: string): string[] {
    const emotionList = AUDIO_TAGS.emotions;
    const regex = /\[([a-zA-Z\s]+)\]/g;
    const matches = [...text.matchAll(regex)];
    
    const emotions: string[] = [];
    for (const match of matches) {
      const tag = match[1].trim().toLowerCase();
      if (emotionList.includes(tag)) {
        emotions.push(tag);
      }
    }
    
    return [...new Set(emotions)];
  }
  
  private stripAllTags(text: string): string {
    // Remove ALL bracket tags (emotion, non-speech, pause, style)
    return text
      .replace(/\[([^\]]+)\]/g, '') // Remove all [tag]
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  
  private buildInstructions(emotions: string[], prosody?: ProsodySettings): string {
    const parts: string[] = [];
    
    // Add emotional tone
    if (emotions.length > 0) {
      const emotionMap: Record<string, string> = {
        excited: 'cheerful and energetic',
        happy: 'joyful and upbeat',
        sad: 'melancholic and soft',
        thoughtful: 'contemplative and measured',
        curious: 'inquisitive and engaged',
        nervous: 'anxious and hesitant',
        angry: 'intense and forceful',
        surprised: 'astonished and animated',
      };
      
      // For multiple emotions, use first emotion as dominant
      // (API limitation - cannot have per-segment emotions)
      const dominantEmotion = emotions[0];
      const mappedEmotion = emotionMap[dominantEmotion] || dominantEmotion;
      
      parts.push(`Speak in a ${mappedEmotion} tone`);
    }
    
    // Add storyteller context
    parts.push('as a storyteller');
    
    // Add prosody adjustments
    if (prosody?.speed && prosody.speed !== 1.0) {
      if (prosody.speed < 0.9) {
        parts.push('speaking slowly');
      } else if (prosody.speed > 1.1) {
        parts.push('speaking quickly');
      }
    }
    
    return parts.join(' ');
  }
}
