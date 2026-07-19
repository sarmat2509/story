import { LOCALE_IDS, type Locale } from '../config/languages';

export const STORY_COMPLEXITY_ADJUSTMENT_STEPS = [-2, -1, 0, 1, 2] as const;

export type StoryComplexityAdjustment = (typeof STORY_COMPLEXITY_ADJUSTMENT_STEPS)[number];

export type StoryComplexityAdjustments = Partial<Record<Locale, StoryComplexityAdjustment>>;

export const DEFAULT_STORY_COMPLEXITY_ADJUSTMENT: StoryComplexityAdjustment = 0;

export const STORY_COMPLEXITY_AGE_GROUPS = ['0-1', '1y', '2-3', '4-5', '6-8', '9-12'] as const;

export function isStoryComplexityAdjustment(value: unknown): value is StoryComplexityAdjustment {
  return (
    typeof value === 'number' &&
    STORY_COMPLEXITY_ADJUSTMENT_STEPS.includes(value as StoryComplexityAdjustment)
  );
}

export function normalizeStoryComplexityAdjustment(value: unknown): StoryComplexityAdjustment {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    return DEFAULT_STORY_COMPLEXITY_ADJUSTMENT;
  }

  const rounded = Math.round(numeric);
  return Math.max(-2, Math.min(2, rounded)) as StoryComplexityAdjustment;
}

export function normalizeStoryComplexityAdjustments(value: unknown): StoryComplexityAdjustments {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    LOCALE_IDS.flatMap((locale) =>
      Object.prototype.hasOwnProperty.call(input, locale)
        ? [[locale, normalizeStoryComplexityAdjustment(input[locale])]]
        : []
    )
  ) as StoryComplexityAdjustments;
}

export function getStoryComplexityAdjustment(
  adjustments: unknown,
  language: string | null | undefined
): StoryComplexityAdjustment {
  const locale = language?.slice(0, 2).toLowerCase() as Locale | undefined;
  if (!locale || !LOCALE_IDS.includes(locale)) {
    return DEFAULT_STORY_COMPLEXITY_ADJUSTMENT;
  }

  return (
    normalizeStoryComplexityAdjustments(adjustments)[locale] ?? DEFAULT_STORY_COMPLEXITY_ADJUSTMENT
  );
}

export function adjustStoryComplexityAgeGroup(ageGroup: string, adjustment: unknown): string {
  const currentIndex = STORY_COMPLEXITY_AGE_GROUPS.indexOf(
    ageGroup as (typeof STORY_COMPLEXITY_AGE_GROUPS)[number]
  );
  if (currentIndex < 0) return ageGroup;

  const nextIndex = Math.max(
    0,
    Math.min(
      STORY_COMPLEXITY_AGE_GROUPS.length - 1,
      currentIndex + normalizeStoryComplexityAdjustment(adjustment)
    )
  );
  return STORY_COMPLEXITY_AGE_GROUPS[nextIndex];
}
