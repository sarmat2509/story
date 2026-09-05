/**
 * LLM-generated hidden character persistence.
 * Tier 1 reuses the same DB row when phonetic name + type match.
 * Tier 2 (embedding) never reuses character identity — only copies turnaround from a visually similar hidden character when above threshold.
 */

import { getCharacterRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import { crossScriptIdentityKey } from '../../utils/characterNormalization';
import { generateEmbedding, cosineSimilarity } from '../embeddingService';
import { ensureLocalizedCharacterNames } from '../translationService';
import { isValidLocale, type Locale } from '@wondertales/shared';

export const LLM_CHARACTER_EMBEDDING_SIMILARITY_THRESHOLD = 0.85;

export type TurnaroundSheetPayload = {
  url: string;
  frontUrl?: string;
  generatedAt: string;
  sourcePhotoUrl: string;
};

function normalizeSourceLocale(locale?: Locale | string | null): Locale | null {
  const normalized = locale?.slice(0, 2).toLowerCase();
  return normalized && isValidLocale(normalized) ? normalized : null;
}

/**
 * Build a payload suitable for CharacterRepository.updateTurnaroundSheet from a stored JSON value.
 * Exported for unit tests.
 */
export function parseTurnaroundSheetForReuse(sheet: unknown): TurnaroundSheetPayload | null {
  if (!sheet || typeof sheet !== 'object') return null;
  const s = sheet as Record<string, unknown>;
  const url = typeof s.url === 'string' ? s.url : null;
  if (!url) return null;
  return {
    url,
    ...(typeof s.frontUrl === 'string' ? { frontUrl: s.frontUrl } : {}),
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : new Date().toISOString(),
    sourcePhotoUrl: typeof s.sourcePhotoUrl === 'string' ? s.sourcePhotoUrl : 'reused_similar_character',
  };
}

export function mapLlmTypeToCharacterType(llmType: string): string {
  switch (llmType) {
    case 'human':
      return 'person';
    case 'animal':
      return 'animal';
    case 'creature':
      return 'imaginary';
    case 'object':
      return 'imaginary';
    default:
      return 'imaginary';
  }
}

export async function findOrCreateLlmCharacter(
  userId: string,
  llmChar: { name: string; type: string; description: string },
  existingHiddenChars: any[],
  options: { sourceLocale?: Locale | string | null } = {},
): Promise<{ characterId: string; isNew: boolean; hasTurnaround: boolean }> {
  const characterRepo = getCharacterRepository();
  const mappedType = mapLlmTypeToCharacterType(llmChar.type);
  const sourceLocale = normalizeSourceLocale(options.sourceLocale);

  const identityKey = crossScriptIdentityKey(llmChar.name);
  const nameMatch = existingHiddenChars.find(
    c => crossScriptIdentityKey(c.name) === identityKey && c.type === mappedType,
  );
  if (nameMatch) {
    await ensureLocalizedCharacterNames(nameMatch, { sourceLocale });
    logger.info({ matched: nameMatch.name, by: 'name' }, 'LLM char matched by name');
    return {
      characterId: nameMatch.id,
      isNew: false,
      hasTurnaround: !!nameMatch.turnaroundSheet,
    };
  }

  const sameTypeChars = existingHiddenChars.filter(
    c => c.type === mappedType && c.descriptionEmbedding,
  );

  let newEmbedding: number[] | null = null;
  let bestMatch: { char: any; score: number } | null = null;

  if (sameTypeChars.length > 0) {
    try {
      newEmbedding = await generateEmbedding(llmChar.description);
      for (const c of sameTypeChars) {
        const score = cosineSimilarity(newEmbedding, c.descriptionEmbedding as number[]);
        if (
          score > LLM_CHARACTER_EMBEDDING_SIMILARITY_THRESHOLD &&
          (!bestMatch || score > bestMatch.score)
        ) {
          bestMatch = { char: c, score };
        }
      }
    } catch (err) {
      logger.warn({ err, llmCharName: llmChar.name }, 'Embedding generation failed, skipping Tier 2 similarity');
    }
  }

  const embedding =
    newEmbedding || (await generateEmbedding(llmChar.description).catch(() => null));

  const created = await characterRepo.create({
    userId,
    name: llmChar.name,
    type: mappedType,
    description: llmChar.description,
    aiGeneratedDescription: llmChar.description,
    descriptionLanguage: sourceLocale,
    descriptionEmbedding: embedding,
    isHidden: true,
  } as any);

  existingHiddenChars.push(created);

  await ensureLocalizedCharacterNames(created, { sourceLocale });

  let hasTurnaround = false;
  if (bestMatch) {
    const sheetPayload = parseTurnaroundSheetForReuse(bestMatch.char.turnaroundSheet);
    if (sheetPayload) {
      await characterRepo.updateTurnaroundSheet(created.id, sheetPayload);
      hasTurnaround = true;
      logger.info(
        {
          newCharacterId: created.id,
          sourceCharacterId: bestMatch.char.id,
          matchedName: bestMatch.char.name,
          newName: llmChar.name,
          score: bestMatch.score.toFixed(3),
        },
        'turnaround_reused_from_similar_character',
      );
    } else {
      logger.info(
        {
          matchedName: bestMatch.char.name,
          newName: llmChar.name,
          score: bestMatch.score.toFixed(3),
          newCharacterId: created.id,
        },
        'LLM character created from similar description (no turnaround to copy)',
      );
    }
  }

  return { characterId: created.id, isNew: true, hasTurnaround };
}
