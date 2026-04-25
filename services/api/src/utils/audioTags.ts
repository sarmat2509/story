/**
 * Audio tags utilities for ElevenLabs v3
 * Tags are used for expressive TTS but must be removed for image generation and UI display
 */

import { stripMarkdownStyleEmphasis } from '@wondertales/shared';
import { getAllAudioTags } from '../constants/audioTags';

/** Whitelist of allowed audio tags (lowercase, normalized). Used for stripForAudio. */
const ALLOWED_AUDIO_TAGS = new Set(getAllAudioTags().map((t) => t.toLowerCase()));

/**
 * Remove SSML-style <break .../> tags and normalize whitespace around them.
 * We only strip the unsupported pause tag here, not arbitrary angle-bracket markup.
 */
export function stripSsmlBreakTags(text: string): string {
  if (!text) return text;

  return text
    .replace(/<break\b[^>]*\/>/gi, ' ')
    .replace(/<break\b[^>]*>\s*<\/break>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Word count for story-length targets: removes bracket tags (audio, character IDs, etc.),
 * HTML tags, and markdown emphasis, then counts whitespace-separated tokens.
 */
export function countNarrationWords(text: string): number {
  const cleaned = stripAllTags(text).trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract the small tangible keepsake label from raw story prose.
 * Writer marks it once as `{label}` (see formatCoreStoryRules). If multiple matches exist, returns the last (typical for the resolution beat).
 */
export function extractStoryKeepsakeLabel(fullText: string): string | null {
  const re = /\{([^{}]+)\}/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    const inner = m[1].trim();
    if (inner.length > 0) last = inner;
  }
  return last;
}

/** Prefer fullText; if no `{...}` there, join scene texts (same marker rules). */
export function extractClosingKeepsakeFromEpisodeText(text: {
  fullText?: string;
  scenes?: Array<{ text?: string }>;
}): string | null {
  if (text.fullText?.trim()) {
    const fromFull = extractStoryKeepsakeLabel(text.fullText);
    if (fromFull) return fromFull;
  }
  if (text.scenes && Array.isArray(text.scenes) && text.scenes.length > 0) {
    const joined = text.scenes.map((s) => s.text || '').join('\n\n');
    return extractStoryKeepsakeLabel(joined);
  }
  return null;
}

/**
 * Remove ALL tags from text (for UI, image generation, storage).
 * Strips tags but KEEPS the text inside them:
 *   - <tag>content</tag> → content (remove tags, keep inner text)
 *   - <tag ... /> → '' (self-closing, nothing to keep)
 *   - [content] → '' (square brackets: audio tags, character IDs — metadata only)
 *   - {keepsake} → keepsake (curly braces removed; inner label stays readable in prose)
 *
 * Use this when displaying or persisting story text without markup.
 */
export function stripAllTags(text: string): string {
  if (!text) return text;

  let result = text;

  // Replace <tag>content</tag> with content (keep inner text, remove tags)
  // Use a loop to handle nested tags (innermost first)
  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(/<[^>]+>([\s\S]*?)<\/[^>]+>/gi, '$1');
  }

  // Remove self-closing tags: <tag ... />
  result = result.replace(/<[^>]+\/>/gi, '');

  // Remove any remaining orphan tags (<tag> or </tag>)
  result = result.replace(/<\/?[^>]+>/gi, '');

  // Remove [content] in square brackets (metadata: audio tags, character IDs)
  result = result.replace(/\[[^\]]*\]/g, '');

  // Unwrap {keepsake} markers (single-level; extractStoryKeepsakeLabel reads raw text before this)
  result = result.replace(/\{([^{}]+)\}/g, (_, inner: string) => inner.trim());

  result = stripMarkdownStyleEmphasis(result);

  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Remove HTML <audio> tags from text.
 * Handles <audio>...</audio> and self-closing <audio ... />.
 */
export function stripHtmlAudioTags(text: string): string {
  if (!text) return text;
  return text
    .replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '')
    .replace(/<audio[^>]*\/>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Remove all audio tags from text (for UI, image generation).
 * Strips [tag] patterns (ElevenLabs) and HTML <audio> tags while preserving text structure.
 *
 * Examples:
 *   "[excited] Hello!" => "Hello!"
 *   "She said [whispers] quietly" => "She said quietly"
 *   "<audio src='x'>text</audio>Hello" => "Hello"
 */
export function stripAudioTags(text: string): string {
  if (!text) return text;

  // Remove HTML <audio> tags first
  let result = stripHtmlAudioTags(text);

  // Remove audio tags pattern: [word] or [word word]
  result = result
    .replace(/\[([a-zA-Z\s]+)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return result;
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
 * Use this before passing text to TTS. For UI/image use stripAllTags(text).
 */
export function stripForAudio(text: string): string {
  if (!text) return text;
  return stripSsmlBreakTags(text)
    .replace(/\[([^\]]+)\]/g, (_, content) => {
      const tag = content.trim().toLowerCase().replace(/\s{2,}/g, ' ');
      return ALLOWED_AUDIO_TAGS.has(tag) ? `[${content}]` : '';
    })
    .replace(/\{([^{}]+)\}/g, (_, inner: string) => inner.trim())
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
