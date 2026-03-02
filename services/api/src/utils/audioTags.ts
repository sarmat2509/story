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
 * Remove character ID annotations injected by LLM prompts.
 * Handles both formats the LLM may produce:
 *   - `[ID: c5f6ebc4-625e-4a0c-b554-6f856e867b5e]`
 *   - `[c5f6ebc4-625e-4a0c-b554-6f856e867b5e]`
 */
export function stripCharacterIds(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\[(?:ID:\s*)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\]/gi, '')
    .replace(/\s{2,}/g, ' ')
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
