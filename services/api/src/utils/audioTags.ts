/**
 * Audio tags utilities for ElevenLabs v3
 * Tags are used for expressive TTS but must be removed for image generation and UI display
 */

/**
 * Remove all audio tags from text
 * Strips [tag] patterns while preserving text structure
 * 
 * Examples:
 *   "[excited] Hello!" => "Hello!"
 *   "She said [whispers] quietly" => "She said quietly"
 *   "[gasps] Oh no! [long pause] What happened?" => "Oh no! What happened?"
 */
export function stripAudioTags(text: string): string {
  if (!text) return text;
  
  // Remove audio tags pattern: [word] or [word word]
  // This regex matches: [ followed by letters/spaces followed by ]
  return text
    .replace(/\[([a-zA-Z\s]+)\]/g, '')
    .replace(/\s{2,}/g, ' ') // Clean up multiple spaces
    .trim();
}

/**
 * Check if text contains audio tags
 */
export function hasAudioTags(text: string): boolean {
  return /\[([a-zA-Z\s]+)\]/.test(text);
}

/**
 * Get list of all audio tags used in text
 * Useful for debugging/analytics
 */
export function extractAudioTags(text: string): string[] {
  const matches = text.match(/\[([a-zA-Z\s]+)\]/g);
  if (!matches) return [];
  
  return matches.map(tag => tag.slice(1, -1).trim());
}
