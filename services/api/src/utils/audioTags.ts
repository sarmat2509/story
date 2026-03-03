/**
 * Audio tags utilities for ElevenLabs v3
 * Tags are used for expressive TTS but must be removed for image generation and UI display
 */

import { getAllAudioTags } from '../constants/audioTags';

/** Whitelist of allowed audio tags (lowercase, normalized). Used for stripForAudio. */
const ALLOWED_AUDIO_TAGS = new Set(getAllAudioTags().map((t) => t.toLowerCase()));

/**
 * Remove all audio tags from text (for UI, image generation).
 * Strips [tag] patterns while preserving text structure.
 *
 * Examples:
 *   "[excited] Hello!" => "Hello!"
 *   "She said [whispers] quietly" => "She said quietly"
 *   "[gasps] Oh no! [long pause] What happened?" => "Oh no! What happened?"
 */
export function stripAudioTags(text: string): string {
  if (!text) return text;

  // Remove audio tags pattern: [word] or [word word]
  return text
    .replace(/\[([a-zA-Z\s]+)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Remove character ID annotations and character names in square brackets (for UI, image).
 * Strips ALL [content] — use stripForAudio when you need to keep allowed audio tags.
 *
 * Handles:
 *   - `[ID: uuid]`, `[ID: Name]`
 *   - `[uuid]` (bare UUID)
 *   - `[Дзвоник]` (character name as speaker tag)
 */
export function stripCharacterIds(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\[ID:\s*[^\]]+\]/g, '')
    .replace(/\s*\[[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\]/gi, '')
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Prepare text for audio synthesis: remove all [X] except allowed audio tags.
 *
 * Use this before passing text to TTS. For UI/image use stripCharacterIds(stripAudioTags(text)).
 */
export function stripForAudio(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[([^\]]+)\]/g, (_, content) => {
      const tag = content.trim().toLowerCase().replace(/\s{2,}/g, ' ');
      return ALLOWED_AUDIO_TAGS.has(tag) ? `[${content}]` : '';
    })
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
