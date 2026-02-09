import { ITagProcessor, TagProcessingResult, ProsodySettings } from '../../base/ITagProcessor';
import { AUDIO_TAGS } from '../../../constants/audioTags';

/**
 * Google TTS tag processor
 * Strategy: Extract emotions → build prompt, keep non-speech tags
 * 
 * LIMITATION: Google TTS applies prompt to entire text.
 * Cannot have different emotions per sentence in single request.
 * Solution: Extract dominant emotion or make multiple requests.
 */
export class GoogleTagProcessor implements ITagProcessor {
  process(text: string, prosody?: ProsodySettings): TagProcessingResult {
    // 1. Extract emotion tags
    const emotions = this.extractEmotionTags(text);
    
    // 2. Remove emotion tags from text
    let cleanText = this.stripEmotionTags(text);
    
    // 3. Convert pause tags: [pause] → [medium pause]
    cleanText = cleanText.replace(/\[pause\]/g, '[medium pause]');
    
    // 4. Convert style tags: [whisper] → [whispering]
    cleanText = cleanText.replace(/\[whisper\]/g, '[whispering]');
    
    // 5. Build prompt from emotions (uses dominant if multiple)
    const prompt = this.buildPrompt(emotions, prosody);
    
    return {
      text: cleanText,
      emotionalControl: {
        type: 'prompt',
        value: prompt,
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
    
    return [...new Set(emotions)]; // unique
  }
  
  private stripEmotionTags(text: string): string {
    const emotionList = AUDIO_TAGS.emotions;
    let result = text;
    
    for (const emotion of emotionList) {
      const regex = new RegExp(`\\[${emotion}\\]`, 'gi');
      result = result.replace(regex, '');
    }
    
    return result.replace(/\s{2,}/g, ' ').trim();
  }
  
  private buildPrompt(emotions: string[], prosody?: ProsodySettings): string {
    const basePrompt = 'Say the following';
    
    if (emotions.length === 0) {
      const tone = prosody?.tone;
      if (tone) {
        return `${basePrompt} in a ${tone} way as a storyteller`;
      }
      return `${basePrompt} as a storyteller`;
    }
    
    // If multiple emotions, use the FIRST (dominant) emotion
    // API limitation: cannot have different prompts per segment
    const dominantEmotion = emotions[0];
    
    return `${basePrompt} in a ${dominantEmotion} way as a storyteller`;
  }
}
