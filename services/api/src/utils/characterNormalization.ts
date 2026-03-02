/**
 * Character Name Normalization Utilities
 * Ensures consistent character names across LLM outputs and database.
 * Supports cross-script matching (e.g. Ukrainian "Емілія" <-> Latin "Emilia")
 * using universal transliteration via any-ascii.
 */

import anyAscii from 'any-ascii';
import type { CharacterData, ChildProfileData } from './types';

export interface NormalizedCharacter {
  originalName: string; // From LLM or user
  normalizedName: string; // Standardized for matching
  description?: string;
  appearance?: string;
  source: 'user_provided' | 'llm_generated' | 'child_profile';
}

/**
 * Normalize character name for consistent matching
 * - Trim whitespace
 * - Lowercase for comparison
 * - Remove special characters (except spaces and hyphens)
 * - Preserve Ukrainian-specific letters: і, ї, є, ґ
 */
export function normalizeCharacterName(name: string): string {
  return name
    .trim()
    .replace(/\s*\[(?:ID:\s*)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\]\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїєґ\s-]/gi, ''); // Keep letters (including Ukrainian), numbers, spaces, hyphens
}

/**
 * Convert any name to a script-independent ASCII phonetic key.
 * Uses any-ascii for universal transliteration (Ukrainian, Russian, French, etc.).
 * Collapses repeated chars so "Емілія" -> "emiliia" -> "emilia" matches "Emilia" -> "emilia".
 */
export function toPhoneticKey(name: string): string {
  const ascii = anyAscii(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // strip non-alphanumeric
  return ascii.replace(/(.)\1+/g, '$1'); // collapse repeated chars
}

/**
 * Build character registry from all sources (user + child + LLM)
 * Returns Map: normalizedName -> full character data.
 * Also stores phonetic key aliases for cross-script matching.
 */
export function buildCharacterRegistry(
  userCharacters: CharacterData[],
  childProfile: ChildProfileData | undefined,
  llmCharacters: any[]
): Map<string, NormalizedCharacter> {
  const registry = new Map<string, NormalizedCharacter>();

  function addEntry(name: string, entry: NormalizedCharacter) {
    const normalized = entry.normalizedName;
    registry.set(normalized, entry);

    // Also store phonetic key alias for cross-script matching
    const phoneticKey = toPhoneticKey(name);
    if (phoneticKey && phoneticKey !== normalized && !registry.has(phoneticKey)) {
      registry.set(phoneticKey, { ...entry });
    }
  }
  
  // Add user-provided characters
  for (const char of userCharacters) {
    const normalized = normalizeCharacterName(char.name);
    addEntry(char.name, {
      originalName: char.name,
      normalizedName: normalized,
      description: char.description,
      appearance: (char as any).aiGeneratedDescription || char.appearance,
      source: 'user_provided',
    });
  }
  
  // Add child profile
  if (childProfile) {
    const normalized = normalizeCharacterName(childProfile.name);
    addEntry(childProfile.name, {
      originalName: childProfile.name,
      normalizedName: normalized,
      description: (childProfile as any).aiGeneratedDescription,
      source: 'child_profile',
    });
  }
  
  // Add LLM-generated characters
  for (const char of llmCharacters) {
    const normalized = normalizeCharacterName(char.name);
    if (!registry.has(normalized)) { // Don't override user characters
      addEntry(char.name, {
        originalName: char.name,
        normalizedName: normalized,
        description: char.description,
        appearance: char.appearance,
        source: 'llm_generated',
      });
    }
  }
  
  return registry;
}

/**
 * Match LLM character names to registry.
 * First tries exact normalized match, then falls back to phonetic key
 * for cross-script matching (e.g. "Emilia" matching "Емілія" in registry).
 */
export function matchCharacterNames(
  llmNames: string[],
  registry: Map<string, NormalizedCharacter>
): string[] {
  return llmNames
    .map(name => {
      const normalized = normalizeCharacterName(name);
      let match = registry.get(normalized);
      if (!match) {
        // Phonetic fallback for cross-script matching
        const phonetic = toPhoneticKey(name);
        match = registry.get(phonetic);
      }
      return match ? match.normalizedName : normalized;
    });
}
