/**
 * Character Name Normalization Utilities
 * Ensures consistent character names across LLM outputs and database
 */

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
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїєґ\s-]/gi, ''); // Keep letters (including Ukrainian), numbers, spaces, hyphens
}

/**
 * Build character registry from all sources (user + child + LLM)
 * Returns Map: normalizedName -> full character data
 */
export function buildCharacterRegistry(
  userCharacters: CharacterData[],
  childProfile: ChildProfileData | undefined,
  llmCharacters: any[]
): Map<string, NormalizedCharacter> {
  const registry = new Map<string, NormalizedCharacter>();
  
  // Add user-provided characters
  for (const char of userCharacters) {
    const normalized = normalizeCharacterName(char.name);
    registry.set(normalized, {
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
    registry.set(normalized, {
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
      registry.set(normalized, {
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
 * Match LLM character names to registry (fuzzy matching)
 * Returns normalized names for consistent storage
 */
export function matchCharacterNames(
  llmNames: string[],
  registry: Map<string, NormalizedCharacter>
): string[] {
  return llmNames
    .map(name => {
      const normalized = normalizeCharacterName(name);
      const match = registry.get(normalized);
      return match ? match.normalizedName : normalized; // Return normalized form
    });
}
