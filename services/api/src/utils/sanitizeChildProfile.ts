/**
 * Sanitizes child profile input by replacing invalid enum values with undefined.
 * Logs invalid values for developer visibility; user sees empty field instead of error.
 */
import { logger } from './logger';
import {
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_STYLES,
  EYE_COLORS,
  SKIN_TONES,
  DISTINCTIVE_FEATURES,
  PERSONALITY_TRAITS,
  FAVORITE_ACTIVITIES,
  INTERESTS,
  COMMON_FEARS,
  AVOID_TOPICS,
} from '@wondertales/shared';

const VALID = {
  hairColor: new Set(HAIR_COLORS),
  hairLength: new Set(HAIR_LENGTHS),
  hairStyle: new Set(HAIR_STYLES),
  eyeColor: new Set(EYE_COLORS),
  skinTone: new Set(SKIN_TONES),
  distinctiveFeatures: new Set(DISTINCTIVE_FEATURES),
  traits: new Set(PERSONALITY_TRAITS),
  favoriteActivities: new Set(FAVORITE_ACTIVITIES),
  interests: new Set(INTERESTS),
  commonFears: new Set(COMMON_FEARS),
  avoidTopics: new Set(AVOID_TOPICS),
  fearLevel: new Set(['none', 'low', 'medium', 'high']),
};

function sanitizeEnum<T>(
  value: T | undefined | null,
  allowed: Set<string>,
  field: string,
  path: string
): T | undefined {
  if (value == null || value === '') return undefined;
  const str = String(value);
  if (allowed.has(str)) return value as T;
  logger.warn(
    { received: str, field, path },
    'Invalid enum value in child profile, field will be empty'
  );
  return undefined;
}

function sanitizeArray<T>(
  arr: T[] | undefined | null,
  allowed: Set<string>,
  field: string,
  path: string
): T[] | undefined {
  if (!arr || !Array.isArray(arr)) return undefined;
  const filtered = arr.filter((v) => {
    const str = String(v);
    if (allowed.has(str)) return true;
    logger.warn(
      { received: str, field, path },
      'Invalid enum value in child profile array, item skipped'
    );
    return false;
  });
  return filtered.length > 0 ? filtered : undefined;
}

export function sanitizeChildProfileBody(body: Record<string, unknown>): void {
  if (body.appearanceTraits && typeof body.appearanceTraits === 'object') {
    const t = body.appearanceTraits as Record<string, unknown>;
    t.hairColor = sanitizeEnum(t.hairColor, VALID.hairColor, 'hairColor', 'appearanceTraits.hairColor');
    t.hairLength = sanitizeEnum(t.hairLength, VALID.hairLength, 'hairLength', 'appearanceTraits.hairLength');
    t.hairStyle = sanitizeEnum(t.hairStyle, VALID.hairStyle, 'hairStyle', 'appearanceTraits.hairStyle');
    t.eyeColor = sanitizeEnum(t.eyeColor, VALID.eyeColor, 'eyeColor', 'appearanceTraits.eyeColor');
    t.skinTone = sanitizeEnum(t.skinTone, VALID.skinTone, 'skinTone', 'appearanceTraits.skinTone');
    t.distinctiveFeatures = sanitizeArray(
      t.distinctiveFeatures as string[] | undefined,
      VALID.distinctiveFeatures,
      'distinctiveFeatures',
      'appearanceTraits.distinctiveFeatures'
    );
  }

  if (body.personality && typeof body.personality === 'object') {
    const p = body.personality as Record<string, unknown>;
    p.traits = sanitizeArray(p.traits as string[] | undefined, VALID.traits, 'traits', 'personality.traits');
    p.favoriteActivities = sanitizeArray(
      p.favoriteActivities as string[] | undefined,
      VALID.favoriteActivities,
      'favoriteActivities',
      'personality.favoriteActivities'
    );
  }

  if (Array.isArray(body.interests)) {
    body.interests = sanitizeArray(body.interests, VALID.interests, 'interests', 'interests') ?? [];
  }

  if (body.sensitivities && typeof body.sensitivities === 'object') {
    const s = body.sensitivities as Record<string, unknown>;
    s.fearLevel = sanitizeEnum(s.fearLevel, VALID.fearLevel, 'fearLevel', 'sensitivities.fearLevel');
    s.commonFears = sanitizeArray(
      s.commonFears as string[] | undefined,
      VALID.commonFears,
      'commonFears',
      'sensitivities.commonFears'
    );
    s.avoidTopics = sanitizeArray(
      s.avoidTopics as string[] | undefined,
      VALID.avoidTopics,
      'avoidTopics',
      'sensitivities.avoidTopics'
    );
  }
}

/**
 * Sanitizes analysis appearance object (from AI). Returns a copy with invalid enum values removed.
 * Used for /analyze response so user never sees invalid values in the form.
 */
export function sanitizeAnalysisAppearance(appearance: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!appearance || typeof appearance !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  out.hairColor = sanitizeEnum(appearance.hairColor, VALID.hairColor, 'hairColor', 'analysis.appearance');
  out.hairLength = sanitizeEnum(appearance.hairLength, VALID.hairLength, 'hairLength', 'analysis.appearance');
  out.hairStyle = sanitizeEnum(appearance.hairStyle, VALID.hairStyle, 'hairStyle', 'analysis.appearance');
  out.eyeColor = sanitizeEnum(appearance.eyeColor, VALID.eyeColor, 'eyeColor', 'analysis.appearance');
  out.skinTone = sanitizeEnum(appearance.skinTone, VALID.skinTone, 'skinTone', 'analysis.appearance');
  out.distinctiveFeatures = sanitizeArray(
    appearance.distinctiveFeatures as string[] | undefined,
    VALID.distinctiveFeatures,
    'distinctiveFeatures',
    'analysis.appearance'
  ) ?? [];
  return out;
}
